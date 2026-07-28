---
"@geotechcli/core": patch
"geotechcli": patch
---

Correct three deterministic engines against their published sources.

- Liquefaction: the Boulanger & Idriss (2014) CRR curve (Eq. 2.24) had been folded onto a single normalized variable, over-predicting cyclic resistance by 1.2x at (N1)60cs = 10 rising to 39x at 30 — a false-safe error that grew with density. The B&I path now implements the full 2014 procedure (density-dependent MSF, K_sigma, iterative C_N, magnitude-dependent Idriss 1999 r_d) and the NCEER path keeps its own Youd et al. (2001) corrections. Settlement uses tributary thickness and an (N1)60cs-dependent volumetric strain instead of a hardcoded 2 m.
- Bearing capacity: `hansen` and `vesic` were the same calculation. Each method now carries its own N-gamma, shape factors and depth factors, and a declared `shape` of square or circular is no longer ignored when `length` is omitted.
- Slope stability: only the first soil layer was used, pore pressure was always zero, and the routine was not Bishop's method (forced |alpha|, double division by m-alpha, slices across the full chord). Rewritten as a correct method of slices with signed base angles and proper daylighting; `method: 'ordinary'` now runs Fellenius instead of relabelling Bishop.
- Added 44 golden-value regression tests pinning these engines to published tables and closed-form benchmarks.
