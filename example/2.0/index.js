'use strict';

var app = require('connect')();
var bodyParser = require('body-parser');
var http = require('http');
var parseurl = require('parseurl');
var qs = require('qs');
var swaggerTools = require('swagger-tools');
var swaggerMetadata = swaggerTools.middleware.v2.swaggerMetadata;
var swaggerRouter = swaggerTools.middleware.v2.swaggerRouter;
var swaggerUi = swaggerTools.middleware.v2.swaggerUi;
var swaggerValidator = swaggerTools.middleware.v2.swaggerValidator;

var serverPort = 3000;

// swaggerMetadata configuration
var options = {
  controllers: './controllers',
  useStubs: process.env.NODE_ENV === 'development' ? true : false // Conditionally turn on stubs (mock mode)
};

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
var swaggerDoc = require('./api/swagger.json');

// Validate the Swagger document
var result = swaggerTools.specs.v2.validate(swaggerDoc);

if (typeof result !== 'undefined') {
  if (result.errors.length > 0) {
    console.log('The server could not start due to invalid Swagger document...');

    console.log('');

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
  }

  if (result.errors.length > 0) {
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
app.use(swaggerMetadata(swaggerDoc));

// Validate Swagger requests
app.use(swaggerValidator());

// Route validated requests to appropriate controller
app.use(swaggerRouter(options));

// Serve the Swagger documents and Swagger UI
app.use(swaggerUi(swaggerDoc));

// Start the server
http.createServer(app).listen(serverPort, function () {
  console.log('Your server is listening on port %d (http://localhost:%d)', serverPort, serverPort);
});
