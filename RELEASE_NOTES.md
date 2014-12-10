## Release Notes


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

[jjv]: https://github.com/acornejo/jjv
[jjve]: https://github.com/silas/jjve
[z-schema]: https://github.com/zaggino/z-schema
