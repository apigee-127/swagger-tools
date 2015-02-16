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

var _ = require('lodash');
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

  it('should not do any routing when there is no controller and use of stubs is off', function (done) {
    helpers.createServer([petStoreJson], {
      handler: function (req, res) {
        res.end('NOT OK');
      },
      swaggerRouterOptions: optionsWithControllersDir
    }, function (app) {
      request(app)
        .get('/api/pet/1')
        .expect(200)
        .end(helpers.expectContent('NOT OK', done));
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
        controllers: {
          'Pets_getById': function (req, res) {
            if (useStubs === req.swagger.useStubs) {
              res.end('OK');
            } else {
              res.end('NOT OK');
            }
          }
        },
        useStubs: useStubs
      };
      var expectedMessage = n === 1 ? samplePet : 'OK';

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
        throw err;
      }

      _.each(responses, function (res) {
        helpers.expectContent(res.expectedMessage)(undefined, res);
      });

      done();
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
  });
});
