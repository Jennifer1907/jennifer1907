---
layout: post
title: "7 A/B Testing Mistakes That Kill Your Experiments"
date: 2025-09-18
category: analytics
banner_emoji: "🧪"
banner_bg: "linear-gradient(135deg, #1a2818, #1e2e1e)"
read_time: 7
tags: [A/B Testing, Statistics, Analytics]
excerpt: "After running hundreds of experiments at Shopify, I've seen the same mistakes sink otherwise promising A/B tests. Here's how to avoid them."
---

After running hundreds of experiments at Shopify—and reviewing dozens more from engineers and PMs who wanted a second opinion—I've seen the same mistakes over and over. Here are the seven that cause the most damage, and how to fix them.

## 1. Peeking at Results and Stopping Early

**The mistake**: The experiment has been running for 3 days. You check the dashboard and see p=0.04. You call it significant and ship.

**The problem**: The p-value fluctuates. If you check 10 times and stop when it crosses 0.05, your false positive rate skyrockets to ~40%.

**The fix**: Pre-commit to a sample size based on a power analysis *before* you start. Then don't stop early—or use sequential testing methods (like mSPRT or always-valid confidence intervals) that are designed for continuous monitoring.

```python
from statsmodels.stats.power import NormalIndPower

analysis = NormalIndPower()
n = analysis.solve_power(
    effect_size=0.05,    # minimum detectable effect (as proportion diff / pooled std)
    power=0.80,
    alpha=0.05,
    alternative="two-sided"
)
print(f"Required sample size per variant: {int(n)}")
```

## 2. Multiple Comparisons Without Correction

**The mistake**: You test 5 button colours. One comes out at p=0.03. You ship the winner.

**The problem**: With 5 comparisons at α=0.05, the probability of at least one false positive is `1 - (1-0.05)^5 ≈ 23%`. You're likely shipping noise.

**The fix**: Apply a correction. Bonferroni is conservative but simple:

```python
from statsmodels.stats.multitest import multipletests

p_values = [0.03, 0.12, 0.08, 0.45, 0.22]
reject, corrected_p, _, _ = multipletests(p_values, alpha=0.05, method="bonferroni")
```

Or use Benjamini-Hochberg (`method="fdr_bh"`) if you care more about controlling false discovery rate than family-wise error rate.

## 3. Ignoring Metric Variance

**The mistake**: You run a revenue-per-user test. Control: $12.40. Treatment: $13.10. Lift: 5.6%. "Statistical significance!" 🎉

**The problem**: Revenue is *highly* skewed—a few big spenders drive enormous variance. Standard t-tests assume roughly normal distributions. With highly skewed data, your standard errors are wrong.

**The fix**: Use bootstrap confidence intervals, or apply a variance reduction technique like CUPED.

```python
import numpy as np

def bootstrap_mean_diff(control, treatment, n_bootstrap=10_000, seed=42):
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n_bootstrap):
        c_sample = rng.choice(control, size=len(control), replace=True)
        t_sample = rng.choice(treatment, size=len(treatment), replace=True)
        diffs.append(t_sample.mean() - c_sample.mean())
    lower, upper = np.percentile(diffs, [2.5, 97.5])
    return lower, upper

ci_low, ci_high = bootstrap_mean_diff(control_revenue, treatment_revenue)
print(f"95% CI for lift: [{ci_low:.2f}, {ci_high:.2f}]")
```

## 4. Network Effects and SUTVA Violations

**The mistake**: You A/B test a social feature by randomising individual users. Treatment users can interact with control users.

**The problem**: The Stable Unit Treatment Value Assumption (SUTVA) is violated—treatment affects control users through spillover. Your estimated effect is biased.

**The fix**: Use cluster-level randomisation (e.g., randomise by geographic region, social graph component, or organisation) when your intervention has network effects.

## 5. Not Checking Guardrail Metrics

**The mistake**: Checkout conversion improved 8%. Ship it!

**The problem**: You didn't notice that returns went up 15% and customer support tickets doubled. Your north-star metric went up; your business went down.

**The fix**: Define guardrail metrics upfront—metrics that must *not* degrade, even if your primary metric improves. If a guardrail is violated, the experiment fails regardless of the primary result.

At Shopify we tracked: conversion rate (primary), returns rate, support ticket rate, and load time (guardrails).

## 6. Segment-Only Reporting

**The mistake**: The overall experiment was neutral, but in the mobile segment, treatment was +12%. "Let's ship just for mobile users!"

**The problem**: This is HARKing (Hypothesising After Results are Known). If you look at 20 segments, you'll find a winner by chance in at least one. This finding hasn't been validated.

**The fix**: Pre-register your subgroup analyses. If you do post-hoc segment analysis, treat it as hypothesis generation—design a new, properly powered experiment to confirm the finding.

## 7. Novelty Effects

**The mistake**: Users love the new feature! Engagement is up 25% in the first week. You ship.

**The problem**: Users are engaging because it's *new*, not because it's *better*. After 2–3 weeks, engagement often regresses back to baseline or below.

**The fix**: Run your experiments for at least 2 full weeks, and ideally long enough to observe a stable post-novelty steady state. Plot engagement curves over time—if treatment is still elevated after 14 days, you can be more confident.

---

## Quick Checklist Before Launching Any A/B Test

- [ ] Sample size calculated via power analysis?
- [ ] Runtime set before launch (not after peeking)?
- [ ] Randomisation unit is the right unit (user vs session vs cluster)?
- [ ] Guardrail metrics defined?
- [ ] Multiple comparisons strategy defined (if testing multiple variants/metrics)?
- [ ] Subgroup analyses pre-registered?
- [ ] Novelty effect considered in planned duration?

Getting experimentation right is one of the highest-leverage skills in data analytics. The statistics are learnable; the discipline takes practice. Good luck!
