One of the major parts of Swagger Tools is its comprehensive validation.  What most people don't realize when validating
Swagger documents is that there are two sources of truth for validating Swagger documents against a particular version
of Swagger:

* The [JSON Schema][json-schema] file(s)
* The Swagger Specification documentation

To properly validate a Swagger document, the Swagger Specification document for the Swagger version in question is the
source of truth.  This means that while the JSON Schema file(s) are important to initially validate the structure of
your Swagger document, there may be some situations where the JSON Schema does not fullfil the complete contract as
described in the Swagger specification documentation.  This is where swagger-tools has stepped in to help pave the way
for doing full Swagger document validation.  swagger-tools starts all Swagger document validation using the JSON Schema
file(s) and only once that validation passes will swagger-tools go through each pertinent _semantic_ validation in its
catalog to do the rest of the validation.

The purpose of this document is to serve as a human readable version of this catalog, a list of the _extra_ validation
required on top of the JSON Schema validation to _really_ validate a Sawgger document.  My hope is that this document
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

## Semantic Validations

| Description | Version(s) | Type |
| :---------- |:----------:| :---:|
| A definition/model cannot declare a property that is already defined by one of its ancestors | * | Error |
| A model's ancestor cannot be a descendant of said model _(Circular reference)_ | 1.2 | Error |
| All defined operation path parameters must correspond to a named element in the API's path _(For example, you cannot have a path parameter named `id` for the following path `/pets/{petId}`)_ | * | Error |
| Authorization/Security defined but there are no references to it | * | Warning |
| Authorization/Security scope defined but there are no reference to it | * | Warning |
| Definition/Model defined but there are no references to it | * | Warning |
| Each API `path` should be equivalently unique _(This applies to both the Resource Listing and the API Declaration for Swagger 1.2.  Example: `/pets/{id}` and `/pets/{petId}` are equivalently the same but not the same verbatim.)_ | * | Error |
| Each API `path` should be unique verbatim _(This applies to both the Resource Listing and the API Declaration for Swagger 1.2)_ | 1.2 | Error |
| Each `code` in an operation's `responseMessages` should be unique | 1.2 | Error |
| Each `resourcePath` should be unique for each API Declaration | 1.2 | Error |
| Each authorization/security reference must correspond to an authorization/security definition | * | Error |
| Each authorization/security reference should contain only unique scopes _(Example: For an `oauth2` authorization/security requirement, when listing the required scopes, each scope should only be listed once.)_ | * | Warning |
| Each authorization/security scope in an authorization/security definition should be unique | * | Warning |
| Each authorization/security scope reference must correspond to an authorization/security scope definition | * | Error |
| Each definition/model property listed in the `required` array must be defined in the `properties` of the model itself or one of its ancestors | * | Error |
| Each definition/model reference must correspond to a definition/model definition | * | Error |
| Each model's `id` property must match the corresponding key in the `models` section of the API Declaration | 1.2 | Error |
| Each operation in an API should have a unique `method` property | 1.2 | Error |
| Each operation parameter should have a unique `name` and type combination, where Swagger 1.2 uses the `paramType` property and in Swagger 2.0 uses the `in` property to indicate type | * | Error |
| Each parameter reference must correspond to a parameter definition | 2.0 | Error |
| Each response reference must correspond to a response definition | 2.0 | Error |
| Every place where a default value can be provided, the default value must validate against the corresponding schema/definition _(This is not handled by JSON Schema validators, at least not the one I am using, so we have to do this manually.  See [json-schema/JSON-Schema-Test-Suite/pull/67](https://github.com/json-schema/JSON-Schema-Test-Suite/pull/67))_ | * | Error |
| For each API path parameter, all operations for the API path require corresponding path parameter definitions | * | Error |
| Models are not allowed to descend from multiple models _(Multiple inheritance)_ | 1.2 | Error |
| Parameter defined but there is no reference to it | 2.0 | Warning |
| Response defined but there is no reference to it | 2.0 | Warning |
| The Resource Listing has an API whose `path` is not defined in any of the API Declarations | 1.2 | Warning |
| The `items` property is required for all schemas/definitions of type `array` _(See [swagger-api/swagger-spec/issues/174](https://github.com/swagger-api/swagger-spec/issues/174))_ | * | Error |

[api-declaration]: https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md#52-api-declaration
[json-schema]: http://json-schema.org/
[resource-listing]: https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md#51-resource-listing
