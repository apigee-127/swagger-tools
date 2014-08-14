/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var response = module.exports.response = 'swagger-router OK';

module.exports.delete = function deletePet (req, res, next) {
  res.writeHead(204);
  res.end();
};

module.exports.getAllPets = module.exports._getAllPets = function getAllPets (req, res, next) {
  res.end(response);
};

module.exports.getPetById = module.exports._getPetById = function getPetById (req, res, next) {
  res.end(response);
};
