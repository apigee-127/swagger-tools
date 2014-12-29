'use strict';

var app = require('connect')();
var http = require('http');
var swaggerTools = require('swagger-tools');

var serverPort = 3000;

// swaggerRouter configuration
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

// Initialize the Swagger middleware
swaggerTools.initializeMiddleware(apiDocJson, apiDeclarations, function (middleware) {
  // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());

  // Validate Swagger requests
  app.use(middleware.swaggerValidator());

  // Route validated requests to appropriate controller
  app.use(middleware.swaggerRouter(options));

  // Serve the Swagger documents and Swagger UI
  app.use(middleware.swaggerUi({
    '/weather': apiDeclarations[0]
  }));

  // Start the server
  http.createServer(app).listen(serverPort, function () {
    console.log('Your server is listening on port %d (http://localhost:%d)', serverPort, serverPort);
  });
});
