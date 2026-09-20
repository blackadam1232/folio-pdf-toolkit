# Release test report

Environment: Linux x86_64, Python 3.12.14, Node 24.19.0. This report covers the supplied source and compiled interface, not a deployed public service.

## Results

- 37 automated tests passed. Coverage includes all ten PDF editing/export operations, image conversion and geometry, natural/alphabetical ordering, encrypted PDF unlock/protect, structural PDF validation, valid API downloads, post-completion revision generation, shared-input deletion safety, cancellation and preview validation.
- Account tests cover invitation registration, login, administrator-only routes, cross-user job isolation, hosted filesystem access denial, CSRF/origin checks, one-time password reset, session revocation and suspended-account login denial.
- TypeScript checking and Vite production build passed. The archive includes that build.
- `pip check` reported no broken requirements in the tested environment.
- The archive was extracted into a new directory with spaces in its path. The 37 tests passed there using the tested Python environment. A separate real Uvicorn HTTP smoke check served the bundled UI, established a local session, uploaded an image, ran the background queue and downloaded a parseable one-page PDF with the correct content type.
- ZIP integrity and dependency/cache exclusions checked.

## Synthetic benchmark

`BENCHMARK_CURRENT.json` records a 5,000-page image conversion: 1.173 seconds, 9,573,095 output bytes and 82.99 MiB peak process RSS. The fixture repeats one small 256×192 solid-color JPEG. It measures the conversion function and final structural/first-last rendering validation, not upload, browser responsiveness, worker startup, photographic workloads or 5,000 distinct files. Reproduce with `python tests/benchmark_current.py`.

## Fixes verified during testing

The upload insert now matches the asset schema. Deleting a completed job while its process exits no longer crashes the scheduler. Completed jobs can be revised without losing their uploaded inputs. Job state uses SQLite instead of the Windows-sensitive status.json rename path. Browser upload selection is snapshotted before asynchronous work; original upload modification dates are retained. Sign-out clears browser session state even after password changes have revoked the backend session.

## Remaining validation and limitations

Native Windows execution, the Windows launcher, Docker builds, Caddy HTTPS and a public multi-user deployment were not run in this environment. Browser visual/interactive testing was unavailable; the frontend was type-checked, built and served over HTTP, and its workflows were reviewed in source. Perform these checks on the target machines before release. No penetration test, full dependency vulnerability audit, plagiarism scan or multi-user load test was performed.

Two test-run deprecation warnings come from Starlette's httpx TestClient and its AnyIO portal alias. They did not fail the tests. Linux resource limits do not provide equivalent memory enforcement on Windows. Runtime PDF validation renders only the first and last pages; manual review is still necessary for important documents. See README and DEPLOYMENT for supported formats, fidelity limits and operational requirements.
