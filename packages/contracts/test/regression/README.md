# Regression tests

One permanent test per security issue ever found — in review, in an audit, in production.

```
REG_00N_ShortName.t.sol
```

Document what was wrong at the top of the file and assert the fixed behaviour. These are never
removed, even when the code they cover is rewritten. A rewrite that reintroduces an old bug is
exactly what they exist to catch.
