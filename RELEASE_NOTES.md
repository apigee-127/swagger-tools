## Release Notes

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
[z-schema]: https://github.com/zaggino/z-schema
