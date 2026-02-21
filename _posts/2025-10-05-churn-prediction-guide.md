---
layout: post
title: "Building a Production Churn Prediction Model: End-to-End"
date: 2025-10-05
category: ml
banner_emoji: "🔮"
banner_bg: "linear-gradient(135deg, #1a1028, #1e1e38)"
read_time: 12
tags: [Machine Learning, Python, XGBoost, MLOps]
excerpt: "A walkthrough of how I built and deployed a merchant churn model at Shopify—from feature engineering through to real-time Airflow scoring."
---

When I joined Shopify's analytics team in 2020, one of my first big projects was building a system to predict which merchants were at risk of churning before they actually cancelled. This post walks through the full journey: problem framing, feature engineering, modelling, and production deployment.

## Problem Framing

"Churn" sounds simple, but defining it precisely is half the battle. We settled on:

> *A merchant churns if they generate zero revenue in the 60 days following their prediction date, after having been active in the prior 90 days.*

This 60-day definition was chosen because:
1. It gave the retention team enough lead time to intervene
2. It avoided flagging seasonal merchants as churned
3. It aligned with how our finance team already defined churn for reporting

**Prediction horizon**: 30 days ahead
**Target variable**: Binary (churned within 60 days of prediction)

## Feature Engineering

Good features beat fancy models every time. We built ~80 features grouped into:

### Behavioural Signals

```python
import pandas as pd
import numpy as np

def compute_behavioural_features(df: pd.DataFrame, snapshot_date: str) -> pd.DataFrame:
    """
    df: merchant daily transaction summary
    snapshot_date: prediction date (we only use history up to this point)
    """
    snap = pd.Timestamp(snapshot_date)

    # Recency features
    df["days_since_last_sale"] = (snap - df["last_sale_date"]).dt.days
    df["days_since_last_login"] = (snap - df["last_login_date"]).dt.days

    # Volume trend (last 30d vs prior 30d)
    df["gmv_30d_vs_60d"] = df["gmv_last_30d"] / (df["gmv_last_60d"] - df["gmv_last_30d"] + 1)

    # Engagement decay
    df["session_trend"] = df["sessions_last_14d"] / (df["sessions_last_28d"] + 1)

    # Support signals
    df["support_tickets_30d"] = df["support_tickets_30d"].fillna(0)
    df["has_billing_issue"] = (df["failed_charges_30d"] > 0).astype(int)

    return df
```

### Plan & Account Features

- Plan type and tenure
- Whether they've upgraded or downgraded recently
- Number of installed apps
- Payment method (credit card vs bank transfer — different churn rates)

### Derived Cohort Features

One of the strongest signals: how does this merchant compare to others who joined at the same time?

```python
def add_cohort_percentiles(df: pd.DataFrame) -> pd.DataFrame:
    cohort_stats = (
        df.groupby("cohort_month")["gmv_last_30d"]
        .transform(lambda x: x.rank(pct=True))
    )
    df["gmv_percentile_in_cohort"] = cohort_stats
    return df
```

## Modelling

We evaluated Logistic Regression, Random Forest, LightGBM, and XGBoost. XGBoost won on both AUC and calibration (important for action thresholds).

```python
from xgboost import XGBClassifier
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score
import optuna

def objective(trial):
    params = {
        "n_estimators":      trial.suggest_int("n_estimators", 200, 1000),
        "max_depth":         trial.suggest_int("max_depth", 3, 8),
        "learning_rate":     trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample":         trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree":  trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "reg_alpha":         trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
        "scale_pos_weight":  trial.suggest_float("scale_pos_weight", 1.0, 10.0),
    }

    model = XGBClassifier(**params, use_label_encoder=False, eval_metric="auc")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    aucs = []
    for train_idx, val_idx in cv.split(X_train, y_train):
        model.fit(X_train.iloc[train_idx], y_train.iloc[train_idx],
                  eval_set=[(X_train.iloc[val_idx], y_train.iloc[val_idx])],
                  early_stopping_rounds=50, verbose=False)
        preds = model.predict_proba(X_train.iloc[val_idx])[:, 1]
        aucs.append(roc_auc_score(y_train.iloc[val_idx], preds))

    return np.mean(aucs)

study = optuna.create_study(direction="maximize")
study.optimize(objective, n_trials=100)
```

**Final model performance:**

| Metric | Value |
|--------|-------|
| AUC-ROC | 0.87 |
| Precision @ top 10% | 0.61 |
| Recall @ 0.3 threshold | 0.74 |

## Calibration Matters

A score of "0.7" is meaningless if it doesn't correspond to a 70% probability. We used Platt scaling to ensure our scores were well-calibrated:

```python
from sklearn.calibration import CalibratedClassifierCV

calibrated_model = CalibratedClassifierCV(best_xgb, method="sigmoid", cv="prefit")
calibrated_model.fit(X_calib, y_calib)
```

## Production Deployment

### Airflow DAG

We run daily scoring at 6am PT via Airflow:

```python
from airflow.decorators import dag, task
from datetime import datetime, timedelta

@dag(
    schedule_interval="0 14 * * *",  # 6am PT = 14:00 UTC
    start_date=datetime(2021, 1, 1),
    catchup=False,
    default_args={"retries": 2, "retry_delay": timedelta(minutes=5)},
)
def merchant_churn_scoring():

    @task
    def extract_features(snapshot_date: str) -> str:
        """Pull feature data from BigQuery, return GCS path."""
        ...

    @task
    def score_merchants(feature_path: str) -> str:
        """Load model from GCS, score all active merchants."""
        ...

    @task
    def write_scores(score_path: str):
        """Write scores to BigQuery churn_scores table."""
        ...

    feature_path = extract_features("{{ ds }}")
    score_path = score_merchants(feature_path)
    write_scores(score_path)

dag = merchant_churn_scoring()
```

### Model Versioning

We used MLflow to track experiments and register model versions. Promoting to production required a code review + a sign-off from the retention team lead that the score distributions looked sane.

## Business Impact

The model powered a tiered intervention programme:

- **Score > 0.7**: Dedicated CSM outreach + discount offer
- **Score 0.4–0.7**: Automated email sequence with feature education
- **Score < 0.4**: No action (control group)

After 6 months, we saw:
- **34% relative reduction** in churn for the high-risk segment
- **$4M in annual retained GMV**
- The model became the foundation for all proactive merchant health programmes

## Key Lessons

1. **Problem definition > model sophistication.** We spent 3 weeks aligning on the churn definition before writing a single line of modelling code. It was worth it.
2. **Calibrate your model.** An uncalibrated score that says "0.7" when the real probability is 0.4 leads to wrong thresholds and wasted retention budget.
3. **Monitor feature drift, not just model performance.** Our biggest production incident was silent feature drift (a pipeline change altered how `days_since_last_login` was computed). AUC looked fine—precision collapsed.
4. **Ship fast, iterate.** The v1 model had only 20 features and an AUC of 0.81. It still delivered most of the business value. Don't wait for perfection.
