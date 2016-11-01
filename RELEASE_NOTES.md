## Release Notes

### TBD

* Added support for nested controllers _(PR #422, Issue #283)_
* Fix issue where the `failedValidation` property was not set for `Content-Type` request validation errors _(PR #420)_
* Fix issue where `array` `body` parameters would coerce non-array types into an array _(Issue #438)

### 0.10.1 (2016-02-24)

* Fix issue with initializing middleware with an invalid Swagger document *(Issue 355)*

### 0.10.0 (2016-02-22)

* Bring back `84b3e83` which was reverted in `0.9.16`

### 0.9.16 (2016-02-22)

* Fix a bug where file parameters could produce a runtime error if `req.files` was empty, which can happen if you do
not provide the parameter *(Issue #350)*
* Revert `v0.9.14` release *(We will be adding it back for `0.10.0`.  Long story short, forces that I do not control
require that I remove this fix and put it into a minor release instead to avoid upstream projects we do not maintain
all the sudden reporting errors in response validation that didn't previously report them.  I am sorry for having to
do this, it was not my idea and I was against it completely.)*

### 0.9.15 (2016-02-15)

* Fixed an issue where `multer.any()` resulted in file parameters not being found properly *(Issue 348)*
* Updated swagger-ui *(Issue #349)*

### v0.9.14 (2016-02-05)

* Fixed an issue where string an `Array` passed as a `String` wasn't handled properly *(PR 341)*

### v0.9.13 (2016-02-02)

* Upgrade json-refs for upstream bug fixes

### v0.9.12 (2016-02-02)

* Fixed a problem when initializing middleware where some errors could terminate without being logged

### v0.9.11 (2016-01-14)

* Added support for nested query parameters, as supported by [qs](https://github.com/ljharb/qs) *(Issue #294)*
* Fixed a bug where the generated swagger-ui URL was wrong behind a proxy *(Issue 297, 317)*

### v0.9.10 (2015-12-29)

* Fixed an issue where `consumes` and `produces` values having a `charset` could break request/response validation *(Issue 295)*
* Fixed an issue where with Swagger 2.0 documents, you cannot use `#validateModel` with an `Array` object *(Issue 303)*
* Fixed an issue where array values were not validated against their validation constraints, on their format/type *(Issue 300)*
* Fixed an issue with `collectionFormat=multi` not working right with singlar values *(Issue 313)*

### v0.9.9 (2015-10-27)

* Backport body-parser to run on environments without `Uint8Array`

### v0.9.8 (2015-10-27)

* Make it so you can provide your own text body parser *(Issue 293)*
* Report all JSON Schema validation errors instead of failing on the first one *(Issue 286)*

### v0.9.7 (2015-10-07)

* Add `ignoreMissingHandler` option to swagger-router middleware to allow the API author to dictate how to handle
missing handlers *(Issue #274)*
* Fix bug with handling primitive body parameters
* Make anyOf/oneOf JSON Schema validation errors more human readable *(Issue #200)*
* Updated swagger-ui *(Issue #273)*
* Updated the Swagger 2.0 JSON Schema

### v0.9.6 (2015-09-30)

* Add support for `allowEmptyValue` for parameters *(Issue #282)*
* Better integer/number validation for parameter values *(PR #279)*
* Fix missing mock support for `date` and `date-time` *(Issue #277)*

### v0.9.5 (2015-08-20)

* Fixed a problem with 304 requests running middleware twice _(PR 270)_

### v0.9.4 (2015-08-19)

* Fixed a problem with mock support in Hapi.js _(Issue #269)_

### v0.9.3 (2015-08-17)

* Fixed an issue where body parameters did not use their real schema during parameter processing _(Issue #251)_

### v0.9.2 (2015-08-05)

* Reverted a463907 _(Issue #259)_

### v0.9.1 (2015-08-04)

* Added support for URI encoded path parameters _(Issue #230)_
* Fixed problem for Express where 204/204 remove the `Content-Type` header which makes response validation impossible _(PR #258)_
* Fixed problem for references to within referenceable objects not marking the referenceable object as referenced _(Issue #176)_
* Updated the build process to produce smaller browser binaries
* Updated the Swagger 2.0 JSON Schema file

### v0.9.0 (2015-07-09)

* Added support for YAML remote references _(Issue #222)_
* Added support to do `operationId` based mapping of controllers _(Do not confuse this with Issue #219/#221)_ _(PR #218)_
* Better error handling and debugging for request/response validation
* Fix bug where a primitive string response could trigger a validation failure due to it treated as a model _(Issue #224)_
* Fix bug where Swagger 2.0 default values were being type coerced unnecessarily _(Issue #235)_
* Fix issue where mock responses did not have their `Content-Type` set propertly to `application/json` _(Mock mode only works with JSON right now)_ _(Issue #234)_
* Fix issue where custom formats would break validation _(Issue #243)_
* Fix problem where references to missing parameters could result in a runtime error _(Issue #233)_
* Updated swagger-router to throw a `500` when there is a configured route handler but it is missing _(Issue #155)_
* Update swagger-metadata to set the `value` property of `req.swagger.params` to be the original value if type coercion fails
* Update swagger-validator to not perform response validation whenever there is no response schema _(PR, 231, Issue #232)_
* Updated version of swagger-converter _(PR #226)_

### v0.8.7 (2015-05-22)

* Added support for collectionFormat in swagger-metadata middleware _(Issue #167)_
* Added support for file/multipart parameters and added tests for all known usages of `form`/`formData` parameters _(Issue #60)_
* Added unit tests for the CLI _(And fixed a number of inconsistencies/bugs as a result)_ _(Issue #84)_
* Added validation that checks for operations with both a body and a form/formData parameter _(Issue #211)_
* Always use `YAML.load` in the CLI when reading files instead of choosing JSON or YAML based on the file extension _(Issue #215)_
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
