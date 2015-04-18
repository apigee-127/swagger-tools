## Release Notes

### TBD

* Fixed bug with inline schemas used for inheritance being marked as unused _(Issue #187)_
* Fixed bug in swaggerUi middleware that did not allow an explicit `apiDocs` path for Swagger 2.0 documents _(Issue #183)_
* Updated CLI validation to have a `--verbose` flag to output pertinent verbose information regardless of validation result _(Issue #179)_

### v0.8.6 (2015-04-16)

* Fixed bug with CLI not handling invalid invocations properly
* Fixed bug with bundled parsers being called unnecessarily in middleware _(Issues #172)_
* Fixed bug with inline schemas for Swagger 2.0 inheritance _(Issue #173)_
* Fixed bug with middleware initialization due to upstream json-resf bug _(Issue #190)_
* Fixed bug with validator middleware where the error object had the right message but the error stack did not _(Issue #175)_
* Update Swagger 2.0 JSON Schema from [swagger-spec][swagger-spec] _(Issue #189)_
* Update Swagger UI to latest _(Issue #163)_

### v0.8.5 (2015-02-20)

* Fix bug in swagger-metadata middleware that could cause `next` to be called more than once due to a downstream error _(Issue #165)_

### v0.8.4 (2015-02-19)

* Support one single Swagger path definition being all undefined subpaths for said path _(Issue #162)_

### v0.8.3 (2015-02-16)

* Fixed bug where unresolvable model references in operation parameters for Swagger 1.2 were not flagged
* Fixed bug in swagger-router where using mock mode caused the server to stop responding after the first request _(Issue #152)_

### v0.8.2 (2015-02-09)

* Debugging support _(Issue #8)_
* Each middleware provided now is one implementation instead of one implementation per Swagger version _(This has zero consumer impact unless you were initializng Swagger middleware directly)_
* Validate operation to ensure only one `body` parameter _(Issue #136)_

### v0.8.1 (2015-01-29)

* swagger-tools CLI displays help output when an invalid command or no command is passed to swagger-tools CLI _(Issue #130)_
* swagger-tools CLI handles invalid Swagger documents caused by an invalid/missing Swagger version _(Issue #129)_
* Bumped all dependencies and development dependencies due to some upstream updates causing issues

### v0.8.0 (2015-01-27)

* Better handling of references to invalid objects _(Issue #120, #121)_
* Fix bug validating models with a `default` attribute _(Issue #124)_
* Fix bug validating models without properties _(Issue #122)_
* swaggerMetadata middleware now converts paramters to their appropriate type _(Issue #119)_
* swaggerRouter middleware now handles void responses for mock mode _(Issue #112)_
* swaggerRouter middleware now wraps controller calls in try/catch block and sends errors downstream via `next` _(Issue #123)_
* swaggerSecurity middleware now sends authentication/authorization errors downstream via `next` _(Issue #117)_
* swaggerSecurity middleware now handles API Key authentication/authorization _(Issue #128)_
* swaggerUi middleware now allows you to serve your own custom swagger-ui resources _(Issue #111)_

### v0.7.4

* Attached the original data sent to `res.end` to response validation errors _(Issue #110)_
* Response validation for Swagger 2.0 now takes the default response into account when validating _(Issue #99)_
* Removed requirement for servers to wire up body/query string parsers _(We default to [body-parser][body-parser] and
[qs][qs] respectively.)_ _(Issue #70)_

### v0.7.3

* Updated the version of Z-Schema being used to fix some browser issues _(Issue #94)_
* Updated to build/test the browser using `gulp` `gulp test` _(Issue #96)_
* Specification APIs for Swagger 2.0 now do a full validation prior to performing the business logic behidn the API
_(Issue #97)_
* Fixed Quick Start documentation example _(Issue 101)_
* Fixed a bug in the CLI where local YAML files were not processed properly _(Issue #104)_
* Fixed a bug where erroneous validation errors were thrown for valid files due to paths with path paramters and vendor
extensions _(Issue #103)_

### v0.7.2

_(Contained only upstream release changes)_

### v0.7.1

* Added API/CLI for Swagger 1.2 to 2.0 conversion _(Issue #41)_
* Fix browser build _(Issue #90)_
* Properly support Swagger 2.0 form parameters _(Issue #88)_
* Support validating responses _(Issue #25)_

### v0.7.0

_(Contains breaking changes)_

* Add an API (`Specification#resolve`) to get all of or part of a Swagger document as fully resolved _(Issue #63)_
* All `Specification` APIs now require an error-first callback as the last argument
* Fix support for header parameters where case caused an issue _(Issue #82)_
* Make sure tests that were async were written properly _(Issue #65)_
* Middleware now requires you to use the `initializeMiddleware` function during server initialization to validate your
Swagger document(s) and return the appropriate middlewares _(Issue #77)_
* Refactor to support upstream path-level authorizations in Swagger 1.2 _(Issue #27)_
* Support path parameters that are not path segments _(Issue #72)_
* Support references throughout the Swagger 2.0 document _(Issues: #38, #55, #68, #73, #79)_
* Support remote reference _(Issue #54)_
* Support Swagger 2.0 security _(Issue #69)_
* Support validating remote files from the CLI _(Issue #74)_
* Support validating YAML files from the CLI _(Issue #75)_
* Switched from [jjv][jjv]+[jjve][jjve] for JSON Schema validation to [ZSchema][z-schema]
* Validate situation in Swagger 1.2 where the model id and the model's `id` field are not the same _(Issue #71)_
* When printing out validation errors/warnings, support inner errors/warnings _(Issue #85)_
* Various minor bug fixes that did not result in issues
* Various documentation/example fixes to support the changes above

[body-parser]: https://github.com/expressjs/body-parser
[jjv]: https://github.com/acornejo/jjv
[jjve]: https://github.com/silas/jjve
[qs]: https://github.com/hapijs/qs
[swagger-spec]: https://github.com/swagger-api/swagger-spec
[z-schema]: https://github.com/zaggino/z-schema
