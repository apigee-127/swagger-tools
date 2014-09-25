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

module.exports.v1 = module.exports.v1_2 = { // jshint ignore:line
  swaggerMetadata: require('./1.2/swagger-metadata'),
  swaggerRouter: require('./1.2/swagger-router'),
  swaggerUi: require('./1.2/swagger-ui'),
  swaggerValidator: require('./1.2/swagger-validator')
};

module.exports.v2 = module.exports.v2_0 = { // jshint ignore:line
  swaggerMetadata: require('./2.0/swagger-metadata'),
  swaggerRouter: require('./2.0/swagger-router'),
  swaggerUi: require('./2.0/swagger-ui'),
  swaggerValidator: require('./2.0/swagger-validator')
};
