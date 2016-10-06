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

var _ = require('lodash-compat');
var assert = require('assert');
var async = require('async');
var helpers = require('../helpers');
var path = require('path');
var petJson = _.cloneDeep(require('../../samples/1.2/pet.json'));
var pkg = require('../../package.json');
var rlJson = _.cloneDeep(require('../../samples/1.2/resource-listing.json'));
var storeJson = _.cloneDeep(require('../../samples/1.2/store.json'));
var userJson = _.cloneDeep(require('../../samples/1.2/user.json'));
var request = require('supertest');

describe('Swagger Metadata Middleware v1.2', function () {
  it('should not add Swagger middleware to the request when there is no route match', function (done) {
    helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
      handler: function (req, res, next) {
        if (req.swagger) {
          return next('This should not happen');
        }
        res.end('OK');
      }
    }, function (app) {
      request(app)
        .get('/foo')
        .expect(200)
        .end(helpers.expectContent('OK', done));
    });
  });

  it('should add Swagger middleware to the request when there is a route match and there are operations',
     function (done) {
       helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
         swaggerRouterOptions: {
           controllers: {
             getPetById: function (req, res, next) {
               var swagger = req.swagger;

               try {
                 assert.ok(!_.isUndefined(swagger));
                 assert.equal('1.2', swagger.swaggerVersion);
                 assert.deepEqual(swagger.api, petJson.apis[0]);
                 assert.deepEqual(swagger.apiDeclaration, petJson);
                 assert.equal(swagger.apiIndex, 0);
                 assert.deepEqual(swagger.authorizations, petJson.apis[0].authorizations || {});
                 assert.deepEqual(swagger.operation, petJson.apis[0].operations[0]);
                 assert.deepEqual(swagger.operationPath, ['apis', '0', 'operations', '0']);
                 assert.deepEqual(swagger.params, {
                   petId: {
                     path: ['apis', '0', 'operations', '0', 'parameters', '0'],
                     schema: petJson.apis[0].operations[0].parameters[0],
                     originalValue: '1',
                     value: 1
                   }
                 });
                 assert.equal(swagger.resourceIndex, 0);
                 assert.deepEqual(swagger.resourceListing, rlJson);
               } catch (err) {
                 return next(err.message);
               }

               res.end('OK');

               return next();
             }
           }
         }
       }, function (app) {
         request(app)
           .get('/api/pet/1')
           .expect(200)
           .end(helpers.expectContent('OK', done));
       });
     });

  it('should handle body parameters', function (done) {
    var cPetJson = _.cloneDeep(petJson);

    // Negate the validation as we don't care about that right now
    cPetJson.models.Pet = {
      id: 'Pet',
      properties: {}
    };

    helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
      swaggerRouterOptions: {
        controllers: {
          addPet: function (req, res, next) {
            assert.deepEqual(req.swagger.params.body.value, {name: 'Top Dog'});

            res.statusCode = 201;
            res.end();

            return next();
          }
        }
      }
    }, function (app) {
      request(app)
        .post('/api/pet')
        .send({name: 'Top Dog'})
        .expect(201)
        .end(done);
    });
  });

  it('should apply JSON parser configuration', function (done) {
    var cPetJson = _.cloneDeep(petJson);
    // Negate the validation as we don't care about that right now
    cPetJson.models.Pet = {
      id: 'Pet',
      properties: {}
    };

    var body = {name: 'Top Dog'};
    var verifyCalled = false;

    helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
      swaggerRouterOptions: {
        controllers: {
          addPet: function (req, res, next) {
            assert.deepEqual(req.swagger.params.body.value, {name: 'Top Dog'});

            res.statusCode = 201;
            res.end();

            return next();
          }
        }
      },
      swaggerMetadataOptions: {
        bodyParser: {
          json: {
            verify: function(){
              verifyCalled = true;
            }
          }
        }
      }
    }, function (app) {
      request(app)
        .post('/api/pet')
        .send(body)
        .expect(201)
        .end(function(){
          assert.equal(verifyCalled, true);
          done();
        });
    });
  });

  it('should handle primitive body parameters', function (done) {
    var cPetJson = _.cloneDeep(petJson);

    cPetJson.apis[2].operations[0].consumes.push('application/x-www-form-urlencoded');
    cPetJson.apis[2].operations[0].parameters[0].type = 'integer';

    helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
      swaggerRouterOptions: {
        controllers: {
          addPet: function (req, res) {
            assert.equal(req.body, 1);
            res.end('OK');
          }
        }
      }
    }, function (app) {
      request(app)
        .post('/api/pet')
        .send('1')
        .expect(200)
        .end(helpers.expectContent('OK', done));
    });
  });

  describe('non-multipart form parameters', function () {
    it('should handle primitives', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            updatePetWithForm: function (req, res, next) {
              assert.equal(req.swagger.params.name.value, 'Top Dog');
              assert.ok(_.isUndefined(req.swagger.params.status.value));

              res.statusCode = 201;
              res.end();

              return next();
            }
          }
        }
      }, function (app) {
        request(app)
          .post('/api/pet/1')
          .type('form')
          .send({name: 'Top Dog'})
          .expect(201)
          .end(done);
      });
    });
  });

  describe('multipart form parameters (Issue 60)', function () {
    it('should handle primitives', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis.push({
        path: '/pet/{id}/name',
        operations: [
          {
            authorizations: {},
            method: 'POST',
            nickname: 'Pets_changePetName',
            parameters: [
              {
                name: 'id',
                paramType: 'path',
                required: true,
                type: 'integer'
              },
              {
                name: 'name',
                paramType: 'form',
                required: true,
                type: 'string'
              }
            ],
            responseMessages: [
              {
                code: 400,
                message: 'Invalid request'
              }
            ],
            type: 'Pet'
          }
        ]
      });

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_changePetName': function (req, res, next) {
              assert.equal(req.swagger.params.name.value, 'Top Dog');

              res.statusCode = 200;
              res.end(JSON.stringify({
                id: req.swagger.params.id.value,
                name: req.swagger.params.name.value
              }));

              return next();
            }
          }
        }
      }, function (app) {
        request(app)
          .post('/api/pet/1/name')
          .field('name', 'Top Dog')
          .expect(200)
          .end(helpers.expectContent({id: 1, name: 'Top Dog'}, done));
      });
    });

    it('should handle files', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[1].operations[0].nickname = 'Pets_uploadImage';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_uploadImage': function (req, res, next) {
              var file = req.swagger.params.file;

              assert.ok(_.isPlainObject(file));
              assert.equal(file.value.originalname, 'package.json');
              assert.equal(file.value.mimetype, 'application/json');
              assert.deepEqual(JSON.parse(file.value.buffer), pkg);

              res.statusCode = 201;
              res.end();

              next();
            }
          }
        }
      }, function(app) {
        request(app)
          .post('/api/pet/uploadImage')
          .attach('file', path.resolve(path.join(__dirname, '..', '..', 'package.json')), 'package.json')
          .expect(201)
          .end(done);
      });
    });

    it('should handle multipart/form-data without files but fields only', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[1].operations[0].nickname = 'Pets_uploadImage';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_uploadImage': function (req, res, next) {
              var file = req.swagger.params.file;
              var name = req.swagger.params.name;

              assert.ok(_.isPlainObject(file));
              assert.ok(_.isUndefined(file.value));

              assert.equal(name.value, 'Heisenberg');

              res.statusCode = 201;
              res.end();

              next();
            }
          }
        }
      }, function(app) {
        request(app)
          .post('/api/pet/uploadImage')
          .field('name', 'Heisenberg')
          .expect(201)
          .end(done);
      });
    });

    it('should handle multiple files', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[1].operations[0].nickname = 'Pets_uploadImage';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_uploadImage': function (req, res, next) {
              var file = req.swagger.params.file;
              var otherFile = req.swagger.params.otherFile;

              assert.ok(_.isPlainObject(file));
              assert.equal(file.value.originalname, 'package.json');
              assert.equal(file.value.mimetype, 'application/json');
              assert.deepEqual(JSON.parse(file.value.buffer), pkg);

              assert.ok(_.isPlainObject(otherFile));
              assert.equal(otherFile.value.originalname, 'package.json');
              assert.equal(otherFile.value.mimetype, 'application/json');
              assert.deepEqual(JSON.parse(otherFile.value.buffer), pkg);

              res.statusCode = 201;
              res.end();

              next();
            }
          }
        }
      }, function(app) {
        request(app)
          .post('/api/pet/uploadImage')
          .attach('file', path.resolve(path.join(__dirname, '..', '..', 'package.json')), 'package.json')
          .attach('otherFile', path.resolve(path.join(__dirname, '..', '..', 'package.json')), 'package.json')
          .expect(201)
          .end(done);
      });
    });
  });

  describe('issues', function () {
    it('should handle non-lowercase header parameteters (Issue 82)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      // Add a header parameter
      cPetJson.apis[0].operations[0].parameters.push({
        description: 'Authentication token',
        name: 'Auth-Token',
        paramType: 'header',
        required: true,
        type: 'string'
      });

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            getPetById: function (req, res, next) {

              try {
                assert.deepEqual(req.swagger.params['Auth-Token'], {
                  path: ['apis', '0', 'operations', '0', 'parameters', '1'],
                  schema: cPetJson.apis[0].operations[0].parameters[1],
                  originalValue: 'fake',
                  value: 'fake'
                });
              } catch (err) {
                return next(err.message);
              }

              res.end('OK');

              return next();
            }
          }
        }
      }, function (app) {
        request(app)
        .get('/api/pet/1')
        .set('Auth-Token', 'fake')
        .expect(200)
        .end(helpers.expectContent('OK', done));
      });
    });

    it('should convert parameteter values to the proper type (Issue 119)', function (done) {
      var argName = 'arg0';
      var queryValues = {
        boolean: 'true',
        integer: '1',
        number: '1.1',
        string: 'swagger-tools',
        'string-date': '2014-06-16',
        'string-date-time': '2014-06-16T18:20:35-06:00'
      };
      var paramValues = {
        boolean: true,
        integer: 1,
        number: 1.1,
        string: 'swagger-tools',
        'string-date': new Date('2014-06-16'),
        'string-date-time': new Date('2014-06-16T18:20:35-06:00')
      };

      async.map(Object.keys(queryValues), function (type, callback) {
        var queryValue = queryValues[type];
        var paramValue = paramValues[type];
        var clonedP = _.cloneDeep(petJson);
        var paramDef = {
          paramType: 'query',
          name: argName
        };
        var query = {};
        var typeParts = type.split('-');

        if (typeParts.length === 1) {
          paramDef.type = type;
        } else {
          paramDef.type = typeParts[0];
          paramDef.format = typeParts.slice(1).join('-');
        }

        query[argName] = queryValue;

        clonedP.apis[0].operations[0].parameters.push(paramDef);

        helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {
          swaggerRouterOptions: {
            controllers: {
               getPetById: function (req, res) {
                assert.deepEqual(paramValue, req.swagger.params[argName].value);

                res.end('OK');
              }
            }
          }
        }, function (app) {
          request(app)
            .get('/api/pet/1')
            .query(query)
            .expect(200)
            .end(callback);
        });
      }, function (err, responses) {
        if (err) {
          return done(err);
        }

        _.each(responses, function (res) {
          assert.equal(res.text, 'OK');
        });

        done();
      });
    });

    it('should handle URI encoded path parameters', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      // Change the type to string so we can send an encoded value
      cPetJson.apis[0].operations[0].parameters[0].type = 'string';

      delete cPetJson.apis[0].operations[0].parameters[0].format;

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            getPetById: function (req, res, next) {
              assert.equal(req.swagger.params.petId.value, 'abc:HZ');

              next();
            }
          }
        }
      }, function (app) {
        request(app)
          .get('/api/pet/abc%3AHZ')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });
  });
});
