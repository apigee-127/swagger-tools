Swagger Tools provides a very simple command line interface that gives you access to some of the API features.

## help

You can run `swagger-tools help` or `swagger-tools <command>` or even `swagger-tools <command> --help` to see the help
output.  If you provide a command, you will get command specific help.  If you do not, you will see a list of the
available commands and their description.

### Global Help

`swagger-tools help` or `swagger-tools --help`

```

  Usage: swagger-tools [options] [command]

  Commands:

    help [command]
       Display help information

    info <version>
       Display information about the Swagger version requested

    validate <resourceListingOrSwaggerDoc> [apiDeclarations...]
       Display validation results for the Swagger document(s)


  Options:

    -h, --help     output usage information
    -V, --version  output the version number

```

### Command Help

`swagger-tools help <command>` or `swagger-tools <command> --help`

```

  Usage: validate [options] <resourceListingOrSwaggerDoc> [apiDeclarations...]

  Options:

    -h, --help  output usage information

```

## info

You can run `swagger-tools info <version>` to get some useful information about the Swagger version provided.  Here is
an example when ran via `swagger-tools info 2.0`:

```

Swagger 2.0 Information:

  documentation url https://github.com/reverb/swagger-spec/blob/master/versions/2.0.md
  schema(s) url     https://github.com/reverb/swagger-spec/tree/master/schemas/v2.0

```

## validate

This is probably the most useful CLI feature as it allows you to take your Swagger document(s) and validate them.  You
can run this command using `swagger-tools validate <resourceListingOrSwaggerDoc> [apiDeclaration...]`.  Of course, with
Swagger 1.2 and Swagger 2.0 being structure differently the usage of this command changes depending on your Swagger API
version.  This command will validate an API in its entirety so for Swagger 1.2, you will need to provide the Swagger
Resource Listing and the Swagger API Declaration documents.

### Swagger 1.2

For Swagger 1.2, you will need to provide the Swagger Resource Listing as the first argument to
`swagger-tools validate`.  All arguments after the first are assumed to be Swagger API Declarations.  Here is an example
usage with sample output for failures:

```
swagger-tools validate samples/1.2/resource-listing.json samples/1.2/pet.json samples/1.2/store.json samples/1.2/user.json

API Errors:

  #/apis/2/path: Resource path is defined but is not used: /store

  API Declaration (/user) Errors:

    #/apis/0/operations/0/parameters/1/type: Model could not be resolved: User
    #/apis/0/operations/2/type: Model could not be resolved: User
    #/apis/3/operations/0/parameters/0/type: Model could not be resolved: User
    #/apis/4/operations/0/parameters/0/items/$ref: Model could not be resolved: User
    #/apis/5/operations/0/parameters/0/items/$ref: Model could not be resolved: User

6 errors and 0 warnings
```

### Swagger 2.0

Swagger 2.0 uses a single file for now so its usage is very simple.  Here is an example with sample output for failures:

```
swagger-tools validate samples/2.0/petstore.json

API Errors:

  #/info: Missing required property: info

1 error and 0 warnings
```
