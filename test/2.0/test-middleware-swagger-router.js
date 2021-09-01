/* global describe, it */

/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';
// Indicate to swagger-tools that we're in testing mode
process.env.RUNNING_SWAGGER_TOOLS_TESTS = 'true';

var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var path = require('path');
var request = require('supertest');
var helpers = require('../helpers');

var petStoreJson = _.cloneDeep(require('../../samples/2.0/petstore.json'));
var optionsWithControllersDir = {
  controllers: path.join(__dirname, '..', 'controllers')
};
var samplePet = {
  category: {
    id: 1,
    name: 'Sample text'
  },
  id: 1,
  name: 'Sample text',
  photoUrls: [
    'Sample text'
  ],
  status: 'available',
  tags: [
    {
      id: 1,
      name: 'Sample text'
    }
  ]
};

// Add nicknames the router understands for the operations we're testing
petStoreJson.paths['/pets']['x-swagger-router-controller'] = 'Pets';
petStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
petStoreJson.paths['/pets/{id}'].delete['x-swagger-router-controller'] = 'Pets';

describe('Swagger Router Middleware v2.0', function () {
  it('should do no routing when there is no route match', function (done) {
    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: optionsWithControllersDir
    }, function (app) {
      request(app)
        .get('/foo')
        .expect(200)
        .end(helpers.expectContent('OK', done));
    });
  });

  it('should return a 405 when thre is a route match but there are no operations', function (done) {
    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: optionsWithControllersDir
    }, function (app) {
      request(app)
        .put('/api/pets/1')
        .expect(405)
        .expect('Allow', 'DELETE, GET')
        .end(helpers.expectContent('Route defined in Swagger specification (/pets/{id}) but there is no defined ' +
                                   'put operation.', done));
    });
  });

  it('should do routing when options.controllers is a valid directory path', function (done) {
    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: optionsWithControllersDir
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(require('../controllers/Pets').response, done));
    });
  });

  it('should do routing when options.controllers is a valid array of directory paths', function (done) {
    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: {
        controllers: [
          path.join(__dirname, '..', 'controllers'),
          path.join(__dirname, '..', 'controllers2')
        ]
      }
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(require('../controllers/Pets').response, done));
    });
  });

  it('should do routing when options.controllers is a valid controller map', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);
    var controller = require('../controllers/Users');

    // Use Users controller
    cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Users';
    cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getById';

    helpers.createServer([cPetStoreJson], {
      swaggerRouterOptions: {
        controllers: {
          'Users_getById': controller.getById
        }
      }
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(controller.response, done));
    });
  });

  it('should do routing when only operationId is given', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);
    var controller = require('../controllers/Users');

    // Use Users controller
    delete cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'];
    cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getById';

    helpers.createServer([cPetStoreJson], {
      swaggerRouterOptions: {
        controllers: {
          'getById': controller.getById
        }
      }
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(controller.response, done));
    });
  });

  it('should return an error when there is no controller and use of stubs is off', function (done) {
    var cOptions = _.cloneDeep(optionsWithControllersDir);

    cOptions.controllers = {};

    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: cOptions
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(500)
        .end(helpers.expectContent('Cannot resolve the configured swagger-router handler: Pets_getPetById', done));
    });
  });

  it('should return an error when there is no controller and ignoreMissingHandlers is true', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);
    var cOptions = _.cloneDeep(optionsWithControllersDir);

    cOptions.ignoreMissingHandlers = true;

    delete cPetStoreJson.paths['/pets']['x-swagger-router-controller'];
    delete cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'];
    delete cPetStoreJson.paths['/pets/{id}'].delete['x-swagger-router-controller'];

    helpers.createServer([cPetStoreJson], {
      swaggerRouterOptions: cOptions
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(200) // Default test handler will always return 'OK'
        .end(helpers.expectContent('OK', done));
    });
  });

  it('should do routing when there is no controller and use of stubs is on', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);
    var cOptions = _.cloneDeep(optionsWithControllersDir);

    cOptions.useStubs = true;

    delete cPetStoreJson.paths['/pets']['x-swagger-router-controller'];
    delete cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'];
    delete cPetStoreJson.paths['/pets/{id}'].delete['x-swagger-router-controller'];

    helpers.createServer([cPetStoreJson], {
      handler: function (req, res) {
        res.end('NOT OK');
      },
      swaggerRouterOptions: cOptions
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(samplePet, done));
    });
  });

  it('should do routing when controller method starts with an underscore', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);

    cPetStoreJson.paths['/pets/{id}'].get.operationId = '_getPetById';

    helpers.createServer([cPetStoreJson], {
      swaggerRouterOptions: optionsWithControllersDir
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(require('../controllers/Pets').response, done));
    });
  });

  it('should do routing when controller is provided but operationId is missing', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);

    delete cPetStoreJson.paths['/pets/{id}'].delete.operationId;

    helpers.createServer([cPetStoreJson], {
      swaggerRouterOptions: optionsWithControllersDir
    }, function (app) {
      request(app)
        .delete('/api/pets/1')
        .expect(204)
        .end(helpers.expectContent('', done));
    });
  });

  it('should indicate whether or not useStubs is on or not', function (done) {
    async.map([0, 1], function (n, callback) {
      var useStubs = n === 1 ? true : false;
      var options = {
        controllers: {},
        useStubs: useStubs
      };
      var expectedMessage = n === 1 ? samplePet : 'OK';

      if (useStubs === false) {
        options.controllers.Pets_getPetById = function (req, res) { // jshint ignore:line
          if (useStubs === req.swagger.useStubs) {
            res.end('OK');
          } else {
            res.end('NOT OK');
          }
        };
      }

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: options
      }, function (app) {
        request(app)
          .get('/api/pets/1')
          .expect(200)
          .end(function (err, res) {
            if (res) {
              res.expectedMessage = expectedMessage;
            }

            callback(err, res);
          });
      });
    }, function (err, responses) {
      if (err) {
        return done(err);
      }

      _.each(responses, function (res) {
        helpers.expectContent(res.expectedMessage)(undefined, res);
      });

      done();
    });
  });
    
  describe('get mock values from default then example', function () {
    it('should return mock string from default over example', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'string',
          pattern: '^([A-Za-z0-9]*)$',
          example: 'exampleString',
          default: 'defaultString'
      };
          
      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify('defaultString'), done));
      });
    });

    it('should return mock string from example if no default', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
          
      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'string',
          pattern: '^([A-Za-z0-9]*)$',
          example: 'exampleString'
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify('exampleString'), done));
      });
    });

    it('should return mock number from default over example', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'number',
          example: 1.01,
          default: 2.02
      };
          
      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify(2.02), done));
      });
    });

    it('should return mock number from example if no default', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
          
      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'number',
          example: 1.01
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify(1.01), done));
      });
    });
  
    it('should return mock integer from default over example', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'integer',
          example: 1,
          default: 2
      };
          
      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify(2), done));
      });
    });

    it('should return mock integer from example if no default', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
          
      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'integer',
          example: 1
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify(1), done));
      });
    });
  
    it('should return mock boolean from default over example', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'boolean',
          example: false,
          default: true
      };
          
      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify(true), done));
      });
    });

    it('should return mock boolean from example if no default', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
          
      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'boolean',
          example: true
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
            useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify(true), done));
      });
    });
  });
    
  describe('mock arrays', function () {
    it('should return array of specified min length', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
            
      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'array',
          items: [{type: 'number'}],
          minItems: 2,
          maxItems: 3
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify([1,1]), done));
      });
    });

    it('should return array of length 1 if not specified', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
            
      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
          type: 'array',
          items: [{type: 'number'}],
          maxItems: 3
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          useStubs: true
        }
      }, function (app) {
        request(app)
        .get('/api/pets/1')
        .expect(200)
        .end(helpers.expectContent(JSON.stringify([1]), done));
      });
    });

    
    });

  describe('issues', function () {
    it('should handle uncaught exceptions (Issue 123)', function (done) {
      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res, next) {
              // This should throw an exception
              if (req['swagger-tools'].fake) {
                next(new Error('This should have been reached'));
              }

              next();
            }
          }
        }
      }, function (app) {
        request(app)
          .get('/api/pets/1')
          .expect(500)
          .end(helpers.expectContent('Cannot read property \'fake\' of undefined', done));
      });
    });

    it('mock mode should support void responses (Issue 112)', function (done) {
      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: {
          useStubs: true
        }
      }, function (app) {
        request(app)
          .delete('/api/pets/1')
          .expect(204)
          .end(helpers.expectContent('', done));
      });
    });

    it('should explicitly set res.statusCode if missing (Issue 269)', function (done) {
      helpers.createServer([petStoreJson], {
        handler: function (req, res, next) {
          delete res.statusCode;

          next();
        },
        swaggerRouterOptions: {
          useStubs: true
        }
      }, function (app) {
        request(app)
          .get('/api/pets/1')
          .expect(200)
          .end(helpers.expectContent(samplePet, done));
      });
    });

    it('should return mock value for date string (Issue #277)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
        type: 'string',
        format: 'date'
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          useStubs: true
        }
      }, function (app) {
        request(app)
          .get('/api/pets/1')
          .expect(200)
          .end(function (err, res) {
            var dateStr = JSON.parse(res.text);

            assert.ok(dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/));

            done();
          });
      });
    });

    it('should return mock value for date-time string (Issue #277)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema = {
        type: 'string',
        format: 'date-time'
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          useStubs: true
        }
      }, function (app) {
        request(app)
          .get('/api/pets/1')
          .expect(200)
          .end(function (err, res) {
            var dateStr = JSON.parse(res.text);
            assert.ok(dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/));

            done();
          });
      });
    });
  });
});
