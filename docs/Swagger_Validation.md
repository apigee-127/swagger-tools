When validating Swagger document(s), the Swagger Specification document for the Swagger version in question is the
single source of truth for validation.  To help aid in Swagger document validation, the Swagger project provides
[JSON Schema][json-schema] file(s) but in the end, the Swagger Specification document is the real source of truth and
the document swagger-tools tries to adhere to.  swagger-tools uses the provided JSON Schema file(s) to do the initial
structural validation of the Swagger document(s) but that is just the beginnging.  There are some situations where the
JSON Schema does not fullfil the complete contract as described in the Swagger specification documentation.  This is
where swagger-tools has stepped in to help pave the way for doing full Swagger document validation.  swagger-tools
starts all Swagger document validation using the JSON Schema file(s) and only once that validation passes will
swagger-tools go through each pertinent _semantic_ validation in its catalog to do the rest of the validation.

The purpose of this document is to serve as a human readable version of this catalog, a list of the _extra_ validation
required on top of the JSON Schema validation to _really_ validate a Swagger document.  My hope is that this document
could be used by Swagger maintainers to enhance their JSON Schema files, where possible, to alleviate the need for
_extra_ validation.  I also hope that this document could be used as a template of sorts for others when writing Swagger
validators in other languages, or even in JavaScript if you don't like what swagger-tools brings to the table.

One last thing before we get into the specifics, there are some situations that are flagged as a _warning_ in
swagger-tools.  Warnings in swagger-tools are situations where the Swagger specification contract is not broken but
there is a good chance you have done something you did not mean to, like creating a model definition and then not
using it anywhere.  In the documentation below, we will break up the error validations from the warning validations.

**Note: Swagger 1.2 Support**

For Swagger 1.2, a Swagger API is treated as a [Resource Listing][resource-listing] and at least one
[API Declaration][api-declaration].  If you are not interested in validating the API as a whole, you might not need
some of the validations performed.

## Defined/Referenceable Types

**Swagger 1.2**

* Authorizations
* Authorization Scopes
* Models

**Swagger 2.0**

* Definitions
* Parameters
* Responses
* Security
* Security Scopes

## Semantic Validations

| Description | Version(s) | Type |
| :---------- |:----------:| :---:|
| A definition/model cannot declare a property that is already defined by one of its ancestors. | * | Error |
| A definition/model's ancestor cannot be a descendant of said model. _(Circular Reference)_ | * | Error |
| An operation cannot have a `form` or `formData` parameter if it has a `body` parameter | * | Error |
| Each API `path` should be unique. _(For Swagger 1.2, this applies to both the Resource Listing and the API Declarations.  For all versions, being unique is both based on verbatim equality and equivalency.  Example: `/pets/{id}` and `/pets/{petId}` are equivalently the same but not the same verbatim.)_ | * | Error |
| Each `code` in an operation's `responseMessages` should be unique. | 1.2 | Error |
| Each `resourcePath` should be unique for each API Declaration in the API. | 1.2 | Error |
| Each authorization/security reference should contain only unique scopes. _(Example: For an `oauth2` authorization/security requirement, when listing the required scopes, each scope should only be listed once.)_ | * | Warning |
| Each authorization/security scope in an authorization/security definition should be unique. | * | Warning |
| Each defined operation path parameters must correspond to a named element in the API's path pattern. _(For example, you cannot have a path parameter named `id` for the following path `/pets/{petId}` but you must have a path parameter named `petId`.)_ | * | Error |
| Each referenceable definition must have references. | * | Warning |
| Each definition/model property listed in the `required` array must be defined in the `properties` of the model itself or one of its ancestors. | * | Error |
| Each model's `id` property must match the corresponding key in the `models` section of the API Declaration. _(For example, a model with an id of `Person` should be found at the `Person` property in the API Declaration's `models` property and the `Person`'s `id` value must be `Person`.)_ | 1.2 | Error |
| Each operation in an API should have a unique `method` property. | 1.2 | Error |
| Each operation parameter should have a unique `name` and type combination, where Swagger 1.2 uses the `paramType` property and in Swagger 2.0 uses the `in` property to indicate type. | * | Error |
| Each operation should have only one parameter of type `body` | * | Error |
| Each reference must point to an existing definition. | * | Error |
| Every place where a default value can be provided, the default value must validate against the corresponding schema/definition. _(This is not handled by JSON Schema validators, at least not the one I am using, so we have to do this manually.  See [json-schema/JSON-Schema-Test-Suite/pull/67](https://github.com/json-schema/JSON-Schema-Test-Suite/pull/67))_ | * | Error |
| For each API path parameter, all operations for the API path require corresponding path parameter definitions or the corresponding path parameter needs to be in the path's parameters. | * | Error |
| Models are not allowed to descend from multiple models. _(Multiple Inheritance)_ | 1.2 | Error |
| The Resource Listing has an API whose `path` is not defined in any of the API Declarations. | 1.2 | Warning |
| The `items` property is required for all schemas/definitions of type `array`. _(See [swagger-api/swagger-spec/issues/174](https://github.com/swagger-api/swagger-spec/issues/174))_ | * | Error |

[api-declaration]: https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md#52-api-declaration
[json-schema]: http://json-schema.org/
[resource-listing]: https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md#51-resource-listing
