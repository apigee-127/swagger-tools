'use strict';

var app = require('connect')();
var bodyParser = require('body-parser');
var http = require('http');
var parseurl = require('parseurl');
var qs = require('qs');
var swaggerTools = require('swagger-tools');
var swaggerMetadata = swaggerTools.middleware.v1.swaggerMetadata;
var swaggerRouter = swaggerTools.middleware.v1.swaggerRouter;
var swaggerUi = swaggerTools.middleware.v1.swaggerUi;
var swaggerValidator = swaggerTools.middleware.v1.swaggerValidator;

var serverPort = 3000;

// swaggerMetadata configuration
var options = {
  controllers: './controllers',
  useStubs: process.env.NODE_ENV === 'development' ? true : false // Conditionally turn on stubs (mock mode)
};

// The Swagger Resource Listing Document (require it, build it programmatically, fetch it from a URL, ...)
var apiDocJson = require('./api/api-doc.json');
// The Swagger API Declaration Documents (require them, build them programmatically, fetch them from a URL, ...)
var apiDeclarations = [
  require('./api/weather.json')
];

// Validate the Swagger documents
var result = swaggerTools.specs.v1.validate(apiDocJson, apiDeclarations);
var errorCount = 0;

if (typeof result !== 'undefined') {
  console.log('The server could not start due to invalid Swagger document...');

  console.log('');

  if (result.errors.length > 0) {
    errorCount += result.errors.length;

    console.log('Errors');
    console.log('------');

    result.errors.forEach(function (err) {
      console.log('#/' + err.path.join('/') + ': ' + err.message);
    });

    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('Warnings');
    console.log('--------');

    result.warnings.forEach(function (warn) {
      console.log('#/' + warn.path.join('/') + ': ' + warn.message);
    });

    console.log('');
  }

  if (result.apiDeclarations) {
    result.apiDeclarations.forEach(function (adResult, index) {
      var errorHeader = 'API Declaration (' + apiDeclarations[index].resourcePath + ') Errors';
      var warningHeader = 'API (' + apiDeclarations[index].resourcePath + ') Warnings';

      if (adResult.errors.length > 0) {
        errorCount += adResult.errors.length;

        console.log(errorHeader);
        console.log(new Array(errorHeader.length + 1).join('-'));

        adResult.errors.forEach(function (err) {
          console.log('#/' + err.path.join('/') + ': ' + err.message);
        });

        console.log('');
      }

      if (adResult.warnings.length > 0) {
        console.log(warningHeader);
        console.log(new Array(warningHeader.length + 1).join('-'));

        adResult.warnings.forEach(function (warn) {
          console.log('#/' + warn.path.join('/') + ': ' + warn.message);
        });

        console.log('');
      }
    });
  }

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Wire up the middleware required by Swagger Tools (body-parser and qs)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(function (req, res, next) {
  if (!req.query) {
    req.query = req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
  }

  return next();
});

// Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
app.use(swaggerMetadata(apiDocJson, apiDeclarations));

// Validate Swagger requests
app.use(swaggerValidator());

// Route validated requests to appropriate controller
app.use(swaggerRouter(options));

// Serve the Swagger documents and Swagger UI
app.use(swaggerUi(apiDocJson, {
  '/weather': apiDeclarations[0]
}));

// Start the server
http.createServer(app).listen(serverPort, function () {
  console.log('Your server is listening on port %d (http://localhost:%d)', serverPort, serverPort);
});
