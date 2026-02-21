---
layout: post
title: "SQL Window Functions Every Data Analyst Should Master"
date: 2025-11-10
category: analytics
banner_emoji: "🪟"
banner_bg: "linear-gradient(135deg, #1e1e28, #1a1a3e)"
read_time: 8
tags: [SQL, Analytics, Data Engineering]
excerpt: "Window functions are the single biggest leap in SQL productivity. Here's a practical guide with real-world examples from my work at Stripe and Shopify."
---

Window functions are, in my opinion, the single biggest productivity leap available to a data analyst who already knows basic SQL. They let you perform calculations across a set of rows that are related to the current row—without collapsing them into groups like `GROUP BY` does.

After years of using them daily at Stripe and Shopify, here are the patterns I reach for most.

## Why Window Functions?

Consider a classic problem: *for each user, show their latest purchase alongside their all-time total spend.*

Without window functions, you'd write multiple CTEs or subqueries. With them:

```sql
SELECT
  user_id,
  order_id,
  amount,
  order_date,
  SUM(amount)  OVER (PARTITION BY user_id)                          AS lifetime_spend,
  RANK()       OVER (PARTITION BY user_id ORDER BY order_date DESC) AS recency_rank
FROM orders;
```

Clean, readable, and single-pass.

## The Anatomy of a Window Function

```sql
function_name([expression])
  OVER (
    [PARTITION BY column_list]
    [ORDER BY column_list]
    [ROWS/RANGE frame_spec]
  )
```

- **PARTITION BY** — like `GROUP BY` but doesn't collapse rows
- **ORDER BY** — defines the ordering within each partition
- **frame spec** — controls which rows are included in the calculation

## The Functions I Use Daily

### 1. `ROW_NUMBER()`, `RANK()`, `DENSE_RANK()`

Perfect for deduplication and top-N queries:

```sql
-- Get the most recent record per user
WITH ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM events
)
SELECT * FROM ranked WHERE rn = 1;
```

> I use `ROW_NUMBER()` when I need exactly one row per partition, `RANK()` when ties should share a rank and leave a gap, and `DENSE_RANK()` when ties should share a rank without gaps.

### 2. `LAG()` and `LEAD()`

Invaluable for time-series analysis:

```sql
SELECT
  date,
  revenue,
  LAG(revenue, 1)  OVER (ORDER BY date) AS prev_day_revenue,
  revenue - LAG(revenue, 1) OVER (ORDER BY date) AS day_over_day_change,
  ROUND(
    100.0 * (revenue - LAG(revenue, 1) OVER (ORDER BY date))
          / NULLIF(LAG(revenue, 1) OVER (ORDER BY date), 0),
    2
  ) AS pct_change
FROM daily_revenue;
```

### 3. Rolling Aggregates with Frame Specs

One of my favourite patterns at Stripe was calculating a 7-day rolling fraud rate:

```sql
SELECT
  event_date,
  fraud_count,
  total_txns,
  SUM(fraud_count) OVER (
    ORDER BY event_date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS rolling_7d_fraud,
  AVG(fraud_count::FLOAT / NULLIF(total_txns, 0)) OVER (
    ORDER BY event_date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS rolling_7d_fraud_rate
FROM daily_fraud_metrics;
```

### 4. `FIRST_VALUE()` and `LAST_VALUE()`

Great for comparing each row to a baseline:

```sql
SELECT
  product_id,
  sale_date,
  price,
  FIRST_VALUE(price) OVER (
    PARTITION BY product_id
    ORDER BY sale_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS first_ever_price,
  price - FIRST_VALUE(price) OVER (
    PARTITION BY product_id
    ORDER BY sale_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS price_drift
FROM price_history;
```

### 5. `NTILE()`

Useful for percentile-based segmentation:

```sql
SELECT
  customer_id,
  lifetime_value,
  NTILE(10) OVER (ORDER BY lifetime_value) AS ltv_decile
FROM customers;
```

## Performance Considerations

Window functions are generally efficient, but watch out for:

- **Multiple `OVER` clauses**: BigQuery and Snowflake can sometimes optimise repeated windows if they're identical—use a CTE or `QUALIFY` to avoid re-scanning.
- **Large frames**: `UNBOUNDED PRECEDING` over an unsorted table can be expensive. Make sure your ORDER BY column is indexed or clustered where possible.
- **`QUALIFY` clause**: In BigQuery/Snowflake, you can filter on window function results without a subquery: `QUALIFY ROW_NUMBER() OVER (...) = 1`.

## A Real-World Pattern: Cohort Retention

At Shopify I built retention analyses using nothing but window functions:

```sql
WITH cohorts AS (
  SELECT
    user_id,
    DATE_TRUNC('month', first_order_date) AS cohort_month
  FROM user_first_orders
),
activity AS (
  SELECT
    o.user_id,
    c.cohort_month,
    DATE_DIFF(
      DATE_TRUNC('month', o.order_date),
      c.cohort_month,
      MONTH
    ) AS months_since_first
  FROM orders o
  JOIN cohorts c USING (user_id)
)
SELECT
  cohort_month,
  months_since_first,
  COUNT(DISTINCT user_id)                    AS active_users,
  FIRST_VALUE(COUNT(DISTINCT user_id)) OVER (
    PARTITION BY cohort_month
    ORDER BY months_since_first
  )                                          AS cohort_size,
  ROUND(100.0 * COUNT(DISTINCT user_id)
    / FIRST_VALUE(COUNT(DISTINCT user_id)) OVER (
        PARTITION BY cohort_month
        ORDER BY months_since_first
      ), 1)                                  AS retention_pct
FROM activity
GROUP BY 1, 2;
```

## Wrap Up

Window functions take maybe an afternoon to learn and will save you hours every week. The patterns above cover 90% of what I encounter in practice. The key muscle to develop is recognising *when* a problem is a window function problem—usually any time you hear "for each X, show Y alongside Z" or "compare each row to the previous/next."

If you want to go deeper, I recommend practising on [Mode's SQL School](https://mode.com/sql-tutorial/) and LeetCode's SQL problems. Happy querying!
