# Third-party notices

Application code uses third-party dependencies. Installing dependencies obtains their code and license files from the relevant package distributions. The prebuilt frontend includes React, React DOM and Scheduler; their MIT license texts are reproduced in THIRD_PARTY_LICENSES.

| Bundled browser dependency | Version | License |
| --- | --- | --- |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| scheduler | 0.28.0 | MIT |

Python dependencies are specified in requirements.txt and requirements-lock.txt. FastAPI, Uvicorn, python-multipart, Pillow, natsort, pypdf, pypdfium2/PDFium, ReportLab, cryptography and argon2-cffi retain their upstream licenses and notices. PDFium and cryptography contain additional upstream components; consult their installed distribution notices before redistributing dependency binaries. This ZIP does not vendor Python dependency binaries.

Node build dependencies include Vite, TypeScript and the React type declarations. They are installed from package-lock.json and are not vendored as node_modules in this archive. Docker images have their own component licenses. No iLovePDF code or assets are included.

The dependency inventory below is read from the tested Python installation. An empty license field means consult its license expression or bundled license file, not that the component has no license.

| Python dependency | Version | License metadata |
| --- | --- | --- |
| fastapi | 0.141.1 | MIT |
| uvicorn | 0.53.0 | BSD-3-Clause |
| python-multipart | 0.0.32 | Apache-2.0 |
| Pillow | 12.3.0 | MIT-CMU |
| natsort | 8.4.0 | MIT |
| pypdf | 6.19.0 | BSD-3-Clause |
| pypdfium2 | 5.13.0 | BSD-3-Clause, Apache-2.0, dependency licenses |
| reportlab | 5.0.1 | BSD license (see license.txt for details), Copyright (c) 2000-2025, ReportLab Inc. |
| cryptography | 50.0.1 | Apache-2.0 OR BSD-3-Clause |
| argon2-cffi | 25.1.0 | MIT |
