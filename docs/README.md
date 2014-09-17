The purpose of Swagger Tools (swagger-tools) is to provide some useful [Swagger][swagger] tooling written in/for
Node.js.  Use the links below to get specific documentation about the provided APIs and tools:

* [API][swagger-tools-api]: The JavaScript API for interacting with Swagger documents
* [Middleware][swagger-tools-middleware]: Connect middleware using Swagger information for various things
(Ex: Request validation, routing, ...)

## Installation

As of right now, Swagger Tools is only available for Node.js.  _(The reason this is mentioned is because we will
eventually make a browser distribution for the applicable parts of the project.  See
[#22](https://github.com/apigee-127/swagger-tools/issues/22).)_

If you want to use the Swagger Tools APIs and middleware, install Swagger Tools into your project like so:

```
npm install swagger-tools --save
```

Installation globally right now doesn't make much sense but when the eventual CLI executables are available, you'd
install Swagger Tools globally like this:

```
npm install -g swagger-tools
```

[swagger]: http://swagger.io/
[swagger-tools-api]: https://github.com/apigee-127/swagger-tools/blob/master/docs/API.md
[swagger-tools-middleware]: https://github.com/apigee-127/swagger-tools/blob/master/docs/Middleware.md
