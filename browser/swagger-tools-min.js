(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.SwaggerTools || (g.SwaggerTools = {})).specs = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
"use strict";var _={each:require("lodash-compat/collection/each"),indexOf:require("lodash-compat/array/indexOf"),isArray:require("lodash-compat/lang/isArray"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),reduce:require("lodash-compat/collection/reduce")},JsonRefs="undefined"!=typeof window?window.JsonRefs:"undefined"!=typeof global?global.JsonRefs:null,traverse="undefined"!=typeof window?window.traverse:"undefined"!=typeof global?global.traverse:null,ZSchema="undefined"!=typeof window?window.ZSchema:"undefined"!=typeof global?global.ZSchema:null,customJsonSchemaFormats=["byte","double","float","int32","int64","mime-type","uri-template"],draft04Json=require("../schemas/json-schema-draft-04.json"),draft04Url="http://json-schema.org/draft-04/schema",specCache={};module.exports.registerCustomFormats=function(e){traverse(e).forEach(function(){var e=this.key,r=this.node;"format"===e&&-1===_.indexOf(ZSchema.getRegisteredFormats(),r)&&ZSchema.registerFormat(r,function(){return!0})})},module.exports.createJsonValidator=function(e){var r,n=new ZSchema({reportPathAsArray:!0});if(n.setRemoteReference(draft04Url,draft04Json),_.each(customJsonSchemaFormats,function(e){ZSchema.registerFormat(e,function(){return!0})}),!_.isUndefined(e)&&(r=n.compileSchema(e),r===!1))throw console.error("JSON Schema file"+(e.length>1?"s are":" is")+" invalid:"),_.each(n.getLastErrors(),function(e){console.error("  "+(_.isArray(e.path)?JsonRefs.pathToPointer(e.path):e.path)+": "+e.message)}),new Error("Unable to create validator due to invalid JSON Schema");return n},module.exports.formatResults=function(e){return e&&(e=e.errors.length+e.warnings.length+_.reduce(e.apiDeclarations,function(e,r){return r&&(e+=r.errors.length+r.warnings.length),e},0)>0?e:void 0),e};var getErrorCount=module.exports.getErrorCount=function(e){var r=0;return e&&(r=e.errors.length,_.each(e.apiDeclarations,function(e){e&&(r+=e.errors.length)})),r},coerceVersion=function(e){return e&&!_.isString(e)&&(e=e.toString(),-1===e.indexOf(".")&&(e+=".0")),e};module.exports.getSpec=function(e,r){var n;if(e=coerceVersion(e),n=specCache[e],_.isUndefined(n))switch(e){case"1.2":n=require("../lib/specs").v1_2;break;case"2.0":n=require("../lib/specs").v2_0;break;default:if(r===!0)throw new Error("Unsupported Swagger version: "+e)}return n},module.exports.getSwaggerVersion=function(e){return _.isPlainObject(e)?coerceVersion(e.swaggerVersion||e.swagger):void 0},module.exports.printValidationResults=function(e,r,n,o,t){var a=getErrorCount(o)>0,i=a?console.error:console.log,s=function(e,r){return 1===r?e:e+"s"},c=function d(e,r,n){e&&(i(e+":"),i()),_.each(r,function(e){i(new Array(n+1).join(" ")+JsonRefs.pathToPointer(e.path)+": "+e.message),e.inner&&d(void 0,e.inner,n+2)}),e&&i()},l=0,u=0;i(),o.errors.length>0&&(l+=o.errors.length,c("API Errors",o.errors,2)),o.warnings.length>0&&(u+=o.warnings.length,c("API Warnings",o.warnings,2)),o.apiDeclarations&&o.apiDeclarations.forEach(function(e,r){if(e){var o=n[r].resourcePath||r;e.errors.length>0&&(l+=e.errors.length,c("  API Declaration ("+o+") Errors",e.errors,4)),e.warnings.length>0&&(u+=e.warnings.length,c("  API Declaration ("+o+") Warnings",e.warnings,4))}}),t&&i(l>0?l+" "+s("error",l)+" and "+u+" "+s("warning",u):"Validation succeeded but with "+u+" "+s("warning",u)),i()},module.exports.swaggerOperationMethods=["DELETE","GET","HEAD","OPTIONS","PATCH","POST","PUT"];

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/specs":2,"../schemas/json-schema-draft-04.json":116,"lodash-compat/array/indexOf":5,"lodash-compat/collection/each":9,"lodash-compat/collection/reduce":13,"lodash-compat/lang/isArray":84,"lodash-compat/lang/isPlainObject":93,"lodash-compat/lang/isString":94,"lodash-compat/lang/isUndefined":96}],2:[function(require,module,exports){
(function (global){
"use strict";var _={cloneDeep:require("lodash-compat/lang/cloneDeep"),difference:require("lodash-compat/array/difference"),each:require("lodash-compat/collection/each"),find:require("lodash-compat/collection/find"),has:require("lodash-compat/object/has"),isArray:require("lodash-compat/lang/isArray"),isFunction:require("lodash-compat/lang/isFunction"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),map:require("lodash-compat/collection/map"),reduce:require("lodash-compat/collection/reduce"),union:require("lodash-compat/array/union")},async="undefined"!=typeof window?window.async:"undefined"!=typeof global?global.async:null,helpers=require("./helpers"),JsonRefs="undefined"!=typeof window?window.JsonRefs:"undefined"!=typeof global?global.JsonRefs:null,SparkMD5="undefined"!=typeof window?window.SparkMD5:"undefined"!=typeof global?global.SparkMD5:null,swaggerConverter="undefined"!=typeof window?window.SwaggerConverter.convert:"undefined"!=typeof global?global.SwaggerConverter.convert:null,traverse="undefined"!=typeof window?window.traverse:"undefined"!=typeof global?global.traverse:null,validators=require("./validators"),YAML="undefined"!=typeof window?window.jsyaml:"undefined"!=typeof global?global.jsyaml:null;_.isPlainObject(swaggerConverter)&&(swaggerConverter=global.SwaggerConverter.convert);var documentCache={},validOptionNames=_.map(helpers.swaggerOperationMethods,function(e){return e.toLowerCase()}),addExternalRefsToValidator=function e(r,n,i){var t=_.reduce(JsonRefs.findRefs(n),function(e,r,n){return JsonRefs.isRemotePointer(n)&&e.push(r.split("#")[0]),e},[]),o=function(n,i){JsonRefs.resolveRefs({$ref:n},function(n,t){return n?i(n):void e(r,t,function(e,r){i(e,r)})})};t.length>0?async.map(t,o,function(e,n){return e?i(e):(_.each(n,function(e,n){r.setRemoteReference(t[n],e),helpers.registerCustomFormats(r,e)}),void i())}):(helpers.registerCustomFormats(n),i())},createErrorOrWarning=function(e,r,n,i){i.push({code:e,message:r,path:n})},addReference=function(e,r,n,i,t){var o,a,s,c,d,u=!0,f=helpers.getSwaggerVersion(e.resolved),l=_.isArray(r)?r:JsonRefs.pathFromPointer(r),p=_.isArray(r)?JsonRefs.pathToPointer(r):r,h=_.isArray(n)?n:JsonRefs.pathFromPointer(n),g=_.isArray(n)?JsonRefs.pathToPointer(n):n;return a=e.definitions[p],d=l[0],o="securityDefinitions"===d?"SECURITY_DEFINITION":d.substring(0,d.length-1).toUpperCase(),s="1.2"===f?l[l.length-1]:p,c="securityDefinitions"===d?"Security definition":o.charAt(0)+o.substring(1).toLowerCase(),["authorizations","securityDefinitions"].indexOf(l[0])>-1&&"scopes"===l[2]&&(o+="_SCOPE",c+=" scope"),_.isUndefined(a)?(t||createErrorOrWarning("UNRESOLVABLE_"+o,c+" could not be resolved: "+s,h,i.errors),u=!1):(_.isUndefined(a.references)&&(a.references=[]),a.references.push(g)),u},getOrComposeSchema=function r(e,n){var i,t,o="Composed "+("1.2"===e.swaggerVersion?JsonRefs.pathFromPointer(n).pop():n),a=e.definitions[n],s=traverse(e.original),c=traverse(e.resolved);return a?(t=_.cloneDeep(s.get(JsonRefs.pathFromPointer(n))),i=_.cloneDeep(c.get(JsonRefs.pathFromPointer(n))),"1.2"===e.swaggerVersion&&(a.lineage.length>0&&(i.allOf=[],_.each(a.lineage,function(n){i.allOf.push(r(e,n))})),delete i.subTypes,_.each(i.properties,function(n,i){var o=t.properties[i];_.each(["maximum","minimum"],function(e){_.isString(n[e])&&(n[e]=parseFloat(n[e]))}),_.each(JsonRefs.findRefs(o),function(i,t){var o="#/models/"+i,a=e.definitions[o],s=JsonRefs.pathFromPointer(t);a.lineage.length>0?traverse(n).set(s.slice(0,s.length-1),r(e,o)):traverse(n).set(s.slice(0,s.length-1).concat("title"),"Composed "+i)})})),i=traverse(i).map(function(e){"id"===this.key&&_.isString(e)&&this.remove()}),i.title=o,i):void 0},createUnusedErrorOrWarning=function(e,r,n,i,t){createErrorOrWarning("UNUSED_"+r,n+" is defined but is not used: "+e,i,t)},getDocumentCache=function(e){var r=SparkMD5.hash(JSON.stringify(e)),n=documentCache[r]||_.find(documentCache,function(e){return e.resolvedId===r});return n||(n=documentCache[r]={definitions:{},original:e,resolved:void 0,swaggerVersion:helpers.getSwaggerVersion(e)}),n},handleValidationError=function(e,r){var n=new Error("The Swagger document(s) are invalid");n.errors=e.errors,n.failedValidation=!0,n.warnings=e.warnings,e.apiDeclarations&&(n.apiDeclarations=e.apiDeclarations),r(n)},normalizePath=function(e){var r=e.match(/\{(.*?)\}/g),n=[],i=e;return r&&_.each(r,function(e,r){i=i.replace(e,"{"+r+"}"),n.push(e.replace(/[{}]/g,""))}),{path:i,args:n}},validateNoExist=function(e,r,n,i,t,o){!_.isUndefined(e)&&e.indexOf(r)>-1&&createErrorOrWarning("DUPLICATE_"+n,i+" already defined: "+r,t,o)},validateSchemaConstraints=function(e,r,n,i,t){try{validators.validateSchemaConstraints(e.swaggerVersion,r,n,void 0)}catch(o){t||createErrorOrWarning(o.code,o.message,o.path,i.errors)}},processDocument=function(e,r){var n=e.swaggerVersion,i=function(r,n){var i=JsonRefs.pathToPointer(r),t=e.definitions[i];return t||(t=e.definitions[i]={inline:n||!1,references:[]},["definitions","models"].indexOf(JsonRefs.pathFromPointer(i)[0])>-1&&(t.cyclical=!1,t.lineage=void 0,t.parents=[])),t},t=function(e){return"1.2"===n?JsonRefs.pathFromPointer(e).pop():e},o=function c(r,n,i){var t=e.definitions[n||r];t&&_.each(t.parents,function(e){i.push(e),r!==e&&c(r,e,i)})},a="1.2"===n?"authorizations":"securityDefinitions",s="1.2"===n?"models":"definitions";switch(_.each(e.resolved[a],function(e,t){var o=[a,t];("1.2"!==n||e.type)&&(i(o),_.reduce(e.scopes,function(e,t,a){var s="1.2"===n?t.scope:a,c=o.concat(["scopes",a.toString()]),d=i(o.concat(["scopes",s]));return d.scopePath=c,validateNoExist(e,s,"AUTHORIZATION_SCOPE_DEFINITION","Authorization scope definition","1.2"===n?c.concat("scope"):c,r.warnings),e.push(s),e},[]))}),_.each(e.resolved[s],function(t,o){var a=[s,o],c=i(a);if("1.2"===n&&o!==t.id&&createErrorOrWarning("MODEL_ID_MISMATCH","Model id does not match id in models object: "+t.id,a.concat("id"),r.errors),_.isUndefined(c.lineage))switch(n){case"1.2":_.each(t.subTypes,function(n,t){var o=["models",n],c=JsonRefs.pathToPointer(o),d=e.definitions[c],u=a.concat(["subTypes",t.toString()]);!d&&e.resolved[s][n]&&(d=i(o)),addReference(e,o,u,r)&&d.parents.push(JsonRefs.pathToPointer(a))});break;default:_.each(e.original[s][o].allOf,function(r,n){var t,o=!1;_.isUndefined(r.$ref)||JsonRefs.isRemotePointer(r.$ref)?(o=!0,t=a.concat(["allOf",n.toString()])):t=JsonRefs.pathFromPointer(r.$ref),_.isUndefined(traverse(e.resolved).get(t))||(i(t,o),c.parents.push(JsonRefs.pathToPointer(t)))})}}),n){case"2.0":_.each(e.resolved.parameters,function(n,t){var o=["parameters",t];i(o),validateSchemaConstraints(e,n,o,r)}),_.each(e.resolved.responses,function(n,t){var o=["responses",t];i(o),validateSchemaConstraints(e,n,o,r)})}_.each(e.definitions,function(i,a){var s,c,d,u=JsonRefs.pathFromPointer(a),f=traverse(e.original).get(u),l=u[0],p=l.substring(0,l.length-1).toUpperCase(),h=p.charAt(0)+p.substring(1).toLowerCase();-1!==["definitions","models"].indexOf(l)&&(s=[],c=[],d=i.lineage,_.isUndefined(d)&&(d=[],o(a,void 0,d),d.reverse(),i.lineage=_.cloneDeep(d),i.cyclical=d.length>1&&d[0]===a),i.parents.length>1&&"1.2"===n&&createErrorOrWarning("MULTIPLE_"+p+"_INHERITANCE","Child "+p.toLowerCase()+" is sub type of multiple models: "+_.map(i.parents,function(e){return t(e)}).join(" && "),u,r.errors),i.cyclical&&createErrorOrWarning("CYCLICAL_"+p+"_INHERITANCE",h+" has a circular inheritance: "+_.map(d,function(e){return t(e)}).join(" -> ")+" -> "+t(a),u.concat("1.2"===n?"subTypes":"allOf"),r.errors),_.each(d.slice(i.cyclical?1:0),function(r){var n=traverse(e.resolved).get(JsonRefs.pathFromPointer(r));_.each(Object.keys(n.properties||{}),function(e){-1===c.indexOf(e)&&c.push(e)})}),validateSchemaConstraints(e,f,u,r),_.each(f.properties,function(n,i){var t=u.concat(["properties",i]);_.isUndefined(n)||(validateSchemaConstraints(e,n,t,r),c.indexOf(i)>-1?createErrorOrWarning("CHILD_"+p+"_REDECLARES_PROPERTY","Child "+p.toLowerCase()+" declares property already declared by ancestor: "+i,t,r.errors):s.push(i))}),_.each(f.required||[],function(e,i){var t="1.2"===n?"Model":"Definition";-1===c.indexOf(e)&&-1===s.indexOf(e)&&createErrorOrWarning("MISSING_REQUIRED_"+t.toUpperCase()+"_PROPERTY",t+" requires property but it is not defined: "+e,u.concat(["required",i.toString()]),r.errors)}))}),_.each(JsonRefs.findRefs(e.original),function(n,i){"1.2"===e.swaggerVersion&&(n="#/models/"+n),JsonRefs.isRemotePointer(n)||addReference(e,n,i,r)}),_.each(e.referencesMetadata,function(e,n){JsonRefs.isRemotePointer(e.ref)&&!_.has(e,"value")&&r.errors.push({code:"UNRESOLVABLE_REFERENCE",message:"Reference could not be resolved: "+e.ref,path:JsonRefs.pathFromPointer(n)})})},validateExist=function(e,r,n,i,t,o){_.isUndefined(e)||-1!==e.indexOf(r)||createErrorOrWarning("UNRESOLVABLE_"+n,i+" could not be resolved: "+r,t,o)},processAuthRefs=function(e,r,n,i){var t="1.2"===e.swaggerVersion?"AUTHORIZATION":"SECURITY_DEFINITION",o="AUTHORIZATION"===t?"Authorization":"Security definition";"1.2"===e.swaggerVersion?_.reduce(r,function(r,a,s){var c=["authorizations",s],d=n.concat([s]);return addReference(e,c,d,i)&&_.reduce(a,function(r,n,a){var s=d.concat(a.toString(),"scope"),u=c.concat(["scopes",n.scope]);return validateNoExist(r,n.scope,t+"_SCOPE_REFERENCE",o+" scope reference",s,i.warnings),addReference(e,u,s,i),r.concat(n.scope)},[]),r.concat(s)},[]):_.reduce(r,function(r,a,s){return _.each(a,function(a,c){var d=["securityDefinitions",c],u=n.concat(s.toString(),c);validateNoExist(r,c,t+"_REFERENCE",o+" reference",u,i.warnings),r.push(c),addReference(e,d,u,i)&&_.each(a,function(r,n){var t=d.concat(["scopes",r]);addReference(e,t,u.concat(n.toString()),i)})}),r},[])},resolveRefs=function(e,r){var n,i=getDocumentCache(e),t=helpers.getSwaggerVersion(e);i.resolved?r():("1.2"===t&&(e=_.cloneDeep(e),n=traverse(e),_.each(JsonRefs.findRefs(e),function(e,r){n.set(JsonRefs.pathFromPointer(r),"#/models/"+e)})),JsonRefs.resolveRefs(e,{processContent:function(e){return YAML.safeLoad(e)}},function(e,n,t){return e?r(e):(i.referencesMetadata=t,i.resolved=n,i.resolvedId=SparkMD5.hash(JSON.stringify(n)),void r())}))},validateAgainstSchema=function(e,r,n,i){var t=_.isString(r)?e.validators[r]:helpers.createJsonValidator(),o=function(){try{validators.validateAgainstSchema(r,n,t)}catch(e){return e.failedValidation?i(void 0,e.results):i(e)}resolveRefs(n,function(e){return i(e)})};addExternalRefsToValidator(t,n,function(e){return e?i(e):(helpers.registerCustomFormats(n),void o())})},validateDefinitions=function(e,r){_.each(e.definitions,function(n,i){var t=JsonRefs.pathFromPointer(i),o=t[0].substring(0,t[0].length-1),a="1.2"===e.swaggerVersion?t[t.length-1]:i,s="securityDefinition"===o?"SECURITY_DEFINITION":o.toUpperCase(),c="securityDefinition"===o?"Security definition":o.charAt(0).toUpperCase()+o.substring(1);0!==n.references.length||n.inline||(n.scopePath&&(s+="_SCOPE",c+=" scope",t=n.scopePath),createUnusedErrorOrWarning(a,s,c,t,r.warnings))})},validateParameters=function(e,r,n,i,t,o,a){var s=function(r){createErrorOrWarning("INVALID_PARAMETER_COMBINATION","API cannot have a a body parameter and a "+("1.2"===e.version?"form":"formData")+" parameter",r,o.errors)},c=[],d=!1,u=!1;_.reduce(i,function(i,a,f){var l=t.concat(["parameters",f.toString()]);if(!_.isUndefined(a))return validateNoExist(i,a.name,"PARAMETER","Parameter",l.concat("name"),o.errors),"body"===a.paramType||"body"===a["in"]?(d===!0?createErrorOrWarning("DUPLICATE_API_BODY_PARAMETER","API has more than one body parameter",l,o.errors):u===!0&&s(l),d=!0):"form"===a.paramType||"formData"===a["in"]?(d===!0&&s(l),u=!0):("path"===a.paramType||"path"===a["in"])&&(-1===n.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,l.concat("name"),o.errors),c.push(a.name)),-1===e.primitives.indexOf(a.type)&&"1.2"===e.version&&addReference(r,"#/models/"+a.type,l.concat("type"),o),validateSchemaConstraints(r,a,l,o,a.skipErrors),i.concat(a.name)},[]),(_.isUndefined(a)||a===!1)&&_.each(_.difference(n.args,c),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,"1.2"===r.swaggerVersion?t.slice(0,2).concat("path"):t,o.errors)})},validateSwagger1_2=function(e,r,n,i){var t=[],o=getDocumentCache(r),a=[],s={errors:[],warnings:[],apiDeclarations:[]};a=_.reduce(r.apis,function(e,r,n){return validateNoExist(e,r.path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors),e.push(r.path),e},[]),processDocument(o,s),t=_.reduce(n,function(r,n,i){var c=s.apiDeclarations[i]={errors:[],warnings:[]},d=getDocumentCache(n);return validateNoExist(r,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),-1===t.indexOf(n.resourcePath)&&(validateExist(a,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),r.push(n.resourcePath)),processDocument(d,c),_.reduce(n.apis,function(r,n,i){var t=["apis",i.toString()],a=normalizePath(n.path);return r.indexOf(a.path)>-1?createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+n.path,t.concat("path"),c.errors):r.push(a.path),_.reduce(n.operations,function(r,n,i){var s=t.concat(["operations",i.toString()]);return validateNoExist(r,n.method,"OPERATION_METHOD","Operation method",s.concat("method"),c.errors),r.push(n.method),-1===e.primitives.indexOf(n.type)&&"1.2"===e.version&&addReference(d,"#/models/"+n.type,s.concat("type"),c),processAuthRefs(o,n.authorizations,s.concat("authorizations"),c),validateSchemaConstraints(d,n,s,c),validateParameters(e,d,a,n.parameters,s,c),_.reduce(n.responseMessages,function(e,r,n){var i=s.concat(["responseMessages",n.toString()]);return validateNoExist(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",i.concat(["code"]),c.errors),r.responseModel&&addReference(d,"#/models/"+r.responseModel,i.concat("responseModel"),c),e.concat(r.code)},[]),r},[]),r},[]),validateDefinitions(d,c),r},[]),validateDefinitions(o,s),_.each(_.difference(a,t),function(e){var n=a.indexOf(e);createUnusedErrorOrWarning(r.apis[n].path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors)}),i(void 0,s)},validateSwagger2_0=function(e,r,n){var i=getDocumentCache(r),t={errors:[],warnings:[]};processDocument(i,t),processAuthRefs(i,r.security,["security"],t),_.reduce(i.resolved.paths,function(r,n,o){var a=["paths",o],s=normalizePath(o);return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+o,a,t.errors),validateParameters(e,i,s,n.parameters,a,t,!0),_.each(n,function(r,o){var c=[],d=a.concat(o),u=[];-1!==validOptionNames.indexOf(o)&&(processAuthRefs(i,r.security,d.concat("security"),t),_.each(r.parameters,function(e){_.isUndefined(e)||(c.push(e),u.push(e.name+":"+e["in"]))}),_.each(n.parameters,function(e){var r=_.cloneDeep(e);r.skipErrors=!0,-1===u.indexOf(e.name+":"+e["in"])&&c.push(r)}),validateParameters(e,i,s,c,d,t),_.each(r.responses,function(e,r){_.isUndefined(e)||validateSchemaConstraints(i,e,d.concat("responses",r),t)}))}),r.concat(s.path)},[]),validateDefinitions(i,t),n(void 0,t)},validateSemantically=function(e,r,n,i){var t=function(e,r){i(e,helpers.formatResults(r))};"1.2"===e.version?validateSwagger1_2(e,r,n,t):validateSwagger2_0(e,r,t)},validateStructurally=function(e,r,n,i){validateAgainstSchema(e,"1.2"===e.version?"resourceListing.json":"schema.json",r,function(r,t){return r?i(r):void(t||"1.2"!==e.version?i(void 0,t):(t={errors:[],warnings:[],apiDeclarations:[]},async.map(n,function(r,n){validateAgainstSchema(e,"apiDeclaration.json",r,n)},function(e,r){return e?i(e):(_.each(r,function(e,r){t.apiDeclarations[r]=e}),void i(void 0,t))})))})},Specification=function(e){var r=function(e,r){return _.reduce(r,function(e,r,n){return e[n]=helpers.createJsonValidator(r),e}.bind(this),{})},n=function(e){var r=_.cloneDeep(this.schemas[e]);return r.id=e,r}.bind(this),i=["string","number","boolean","integer","array"];switch(e){case"1.2":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md",this.primitives=_.union(i,["void","File"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2",this.schemas={"apiDeclaration.json":require("../schemas/1.2/apiDeclaration.json"),"authorizationObject.json":require("../schemas/1.2/authorizationObject.json"),"dataType.json":require("../schemas/1.2/dataType.json"),"dataTypeBase.json":require("../schemas/1.2/dataTypeBase.json"),"infoObject.json":require("../schemas/1.2/infoObject.json"),"modelsObject.json":require("../schemas/1.2/modelsObject.json"),"oauth2GrantType.json":require("../schemas/1.2/oauth2GrantType.json"),"operationObject.json":require("../schemas/1.2/operationObject.json"),"parameterObject.json":require("../schemas/1.2/parameterObject.json"),"resourceListing.json":require("../schemas/1.2/resourceListing.json"),"resourceObject.json":require("../schemas/1.2/resourceObject.json")},this.validators=r(this,{"apiDeclaration.json":_.map(["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"],n),"resourceListing.json":_.map(["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"],n)});break;case"2.0":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md",this.primitives=_.union(i,["file"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0",this.schemas={"schema.json":require("../schemas/2.0/schema.json")},this.validators=r(this,{"schema.json":[n("schema.json")]});break;default:throw new Error(e+" is an unsupported Swagger specification version")}this.version=e};Specification.prototype.validate=function(e,r,n){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r))throw new Error("apiDeclarations is required");if(!_.isArray(r))throw new TypeError("apiDeclarations must be an array");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object")}if("2.0"===this.version&&(n=arguments[1]),_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");"2.0"===this.version&&(r=[]),validateStructurally(this,e,r,function(i,t){i||helpers.formatResults(t)?n(i,t):validateSemantically(this,e,r,n)}.bind(this))},Specification.prototype.composeModel=function(e,r,n){var i=helpers.getSwaggerVersion(e),t=function(i,t){var o;return i?n(i):helpers.getErrorCount(t)>0?handleValidationError(t,n):(o=getDocumentCache(e),t={errors:[],warnings:[]},processDocument(o,t),o.definitions[r]?helpers.getErrorCount(t)>0?handleValidationError(t,n):void n(void 0,getOrComposeSchema(o,r)):n())};switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if("#"!==r.charAt(0)){if("1.2"!==this.version)throw new Error("modelRef must be a JSON Pointer");r="#/models/"+r}"1.2"===i?validateAgainstSchema(this,"apiDeclaration.json",e,t):this.validate(e,t)},Specification.prototype.validateModel=function(e,r,n,i){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("data is required");if(_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");this.composeModel(e,r,function(e,r){return e?i(e):void validateAgainstSchema(this,r,n,i)}.bind(this))},Specification.prototype.resolve=function(e,r,n){var i,t=function(e){return _.isString(r)?n(void 0,traverse(e).get(JsonRefs.pathFromPointer(r))):n(void 0,e)};if(_.isUndefined(e))throw new Error("document is required");if(!_.isPlainObject(e))throw new TypeError("document must be an object");if(2===arguments.length&&(n=arguments[1],r=void 0),!_.isUndefined(r)&&!_.isString(r))throw new TypeError("ptr must be a JSON Pointer string");if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if(i=getDocumentCache(e),"1.2"===i.swaggerVersion)throw new Error("Swagger 1.2 is not supported");return i.resolved?t(i.resolved):void this.validate(e,function(e,r){return e?n(e):helpers.getErrorCount(r)>0?handleValidationError(r,n):t(i.resolved)})},Specification.prototype.convert=function(e,r,n,i){var t=function(e,r){i(void 0,swaggerConverter(e,r))}.bind(this);if("1.2"!==this.version)throw new Error("Specification#convert only works for Swagger 1.2");if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r)&&(r=[]),!_.isArray(r))throw new TypeError("apiDeclarations must be an array");if(arguments.length<4&&(i=arguments[arguments.length-1]),_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");n===!0?t(e,r):this.validate(e,r,function(n,o){return n?i(n):helpers.getErrorCount(o)>0?handleValidationError(o,i):void t(e,r)})},module.exports.v1=module.exports.v1_2=new Specification("1.2"),module.exports.v2=module.exports.v2_0=new Specification("2.0");
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../schemas/1.2/apiDeclaration.json":104,"../schemas/1.2/authorizationObject.json":105,"../schemas/1.2/dataType.json":106,"../schemas/1.2/dataTypeBase.json":107,"../schemas/1.2/infoObject.json":108,"../schemas/1.2/modelsObject.json":109,"../schemas/1.2/oauth2GrantType.json":110,"../schemas/1.2/operationObject.json":111,"../schemas/1.2/parameterObject.json":112,"../schemas/1.2/resourceListing.json":113,"../schemas/1.2/resourceObject.json":114,"../schemas/2.0/schema.json":115,"./helpers":1,"./validators":3,"lodash-compat/array/difference":4,"lodash-compat/array/union":7,"lodash-compat/collection/each":9,"lodash-compat/collection/find":10,"lodash-compat/collection/map":12,"lodash-compat/collection/reduce":13,"lodash-compat/lang/cloneDeep":82,"lodash-compat/lang/isArray":84,"lodash-compat/lang/isFunction":88,"lodash-compat/lang/isPlainObject":93,"lodash-compat/lang/isString":94,"lodash-compat/lang/isUndefined":96,"lodash-compat/object/has":97}],3:[function(require,module,exports){
"use strict";var _={cloneDeep:require("lodash-compat/lang/cloneDeep"),each:require("lodash-compat/collection/each"),isArray:require("lodash-compat/lang/isArray"),isBoolean:require("lodash-compat/lang/isBoolean"),isDate:require("lodash-compat/lang/isDate"),isFinite:require("lodash-compat/lang/isFinite"),isNull:require("lodash-compat/lang/isNull"),isNumber:require("lodash-compat/lang/isNumber"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),map:require("lodash-compat/collection/map"),union:require("lodash-compat/array/union"),uniq:require("lodash-compat/array/uniq")},helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,isValidDate=function(e){var t,i,a;return _.isDate(e)?!0:(_.isString(e)||(e=e.toString()),i=dateRegExp.exec(e),null===i?!1:(t=i[3],a=i[2],"01">a||a>"12"||"01">t||t>"31"?!1:!0))},isValidDateTime=function(e){var t,i,a,r,n,o,d;return _.isDate(e)?!0:(_.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),i=o[0],a=o.length>1?o[1]:void 0,isValidDate(i)?(r=dateTimeRegExp.exec(a),null===r?!1:(t=r[1],n=r[2],d=r[3],t>"23"||n>"59"||d>"59"?!1:!0)):!1)},throwErrorWithCode=function(e,t){var i=new Error(t);throw i.code=e,i.failedValidation=!0,i};module.exports.validateAgainstSchema=function(e,t,i){var a=function(e){delete e.params,e.inner&&_.each(e.inner,function(e){a(e)})},r=_.isPlainObject(e)?_.cloneDeep(e):e;_.isUndefined(i)&&(i=helpers.createJsonValidator([r]));var n=i.validate(t,r);if(!n)try{throwErrorWithCode("SCHEMA_VALIDATION_FAILED","Failed schema validation")}catch(o){throw o.results={errors:_.map(i.getLastErrors(),function(e){return a(e),e}),warnings:[]},o}};var validateArrayType=module.exports.validateArrayType=function(e){"array"===e.type&&_.isUndefined(e.items)&&throwErrorWithCode("OBJECT_MISSING_REQUIRED_PROPERTY","Missing required property: items")};module.exports.validateContentType=function(e,t,i){var a="function"==typeof i.end,r=a?i.getHeader("content-type"):i.headers["content-type"],n=_.union(e,t);if(r||(r=a?"text/plain":"application/octet-stream"),r=r.split(";")[0],n.length>0&&(a?!0:-1!==["POST","PUT"].indexOf(i.method))&&-1===n.indexOf(r))throw new Error("Invalid content type ("+r+").  These are valid: "+n.join(", "))};var validateEnum=module.exports.validateEnum=function(e,t){_.isUndefined(t)||_.isUndefined(e)||-1!==t.indexOf(e)||throwErrorWithCode("ENUM_MISMATCH","Not an allowable value ("+t.join(", ")+"): "+e)},validateMaximum=module.exports.validateMaximum=function(e,t,i,a){var r,n,o=a===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&n>=r?throwErrorWithCode(o,"Greater than or equal to the configured maximum ("+t+"): "+e):n>r&&throwErrorWithCode(o,"Greater than the configured maximum ("+t+"): "+e))},validateMaxItems=module.exports.validateMaxItems=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("ARRAY_LENGTH_LONG","Array is too long ("+e.length+"), maximum "+t)},validateMaxLength=module.exports.validateMaxLength=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("MAX_LENGTH","String is too long ("+e.length+" chars), maximum "+t)},validateMaxProperties=module.exports.validateMaxProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&i>t&&throwErrorWithCode("MAX_PROPERTIES","Number of properties is too many ("+i+" properties), maximum "+t)},validateMinimum=module.exports.validateMinimum=function(e,t,i,a){var r,n,o=a===!0?"MINIMUM_EXCLUSIVE":"MINIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&r>=n?throwErrorWithCode(o,"Less than or equal to the configured minimum ("+t+"): "+e):r>n&&throwErrorWithCode(o,"Less than the configured minimum ("+t+"): "+e))},validateMinItems=module.exports.validateMinItems=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("ARRAY_LENGTH_SHORT","Array is too short ("+e.length+"), minimum "+t)},validateMinLength=module.exports.validateMinLength=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("MIN_LENGTH","String is too short ("+e.length+" chars), minimum "+t)},validateMinProperties=module.exports.validateMinProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&t>i&&throwErrorWithCode("MIN_PROPERTIES","Number of properties is too few ("+i+" properties), minimum "+t)},validateMultipleOf=module.exports.validateMultipleOf=function(e,t){_.isUndefined(t)||e%t===0||throwErrorWithCode("MULTIPLE_OF","Not a multiple of "+t)},validatePattern=module.exports.validatePattern=function(e,t){!_.isUndefined(t)&&_.isNull(e.match(new RegExp(t)))&&throwErrorWithCode("PATTERN","Does not match required pattern: "+t)};module.exports.validateRequiredness=function(e,t){!_.isUndefined(t)&&t===!0&&_.isUndefined(e)&&throwErrorWithCode("REQUIRED","Is required")};var validateTypeAndFormat=module.exports.validateTypeAndFormat=function e(t,i,a,r,n){var o=!0,d=i;if(_.isArray(i))_.each(i,function(i,n){e(t,i,a,r,!0)||throwErrorWithCode("INVALID_TYPE","Value at index "+n+" is not a valid "+a+": "+i)});else switch(a){case"boolean":"1.2"===t&&_.isString(i)&&("false"===i?i=!1:"true"===i&&(i=!0)),o=_.isBoolean(i);break;case"integer":"1.2"===t&&_.isString(i)&&(i=parseInt(i,10)),o=_.isFinite(i);break;case"number":"1.2"===t&&_.isString(i)&&(i=parseFloat(i)),o=_.isFinite(i);break;case"string":if(!_.isUndefined(r))switch(r){case"date":o=isValidDate(i);break;case"date-time":o=isValidDateTime(i)}break;case"void":o=_.isUndefined(i)}return n?o:void(o||throwErrorWithCode("INVALID_TYPE","void"!==a?"Not a valid "+(_.isUndefined(r)?"":r+" ")+a+": "+d:"Void does not allow a value"))},validateUniqueItems=module.exports.validateUniqueItems=function(e,t){_.isUndefined(t)||_.uniq(e).length===e.length||throwErrorWithCode("ARRAY_UNIQUE","Does not allow duplicate values: "+e.join(", "))};module.exports.validateSchemaConstraints=function(e,t,i,a){var r=function d(e){var t=e;return t.schema&&(i=i.concat(["schema"]),t=d(t.schema)),t},n=t.type;n||(t.schema?(t=r(t),n=t.type||"object"):n="responses"===i[i.length-2]?"void":"object");try{if("array"===n&&validateArrayType(t),_.isUndefined(a)&&(a="1.2"===e?t.defaultValue:t["default"],i=i.concat(["1.2"===e?"defaultValue":"default"])),_.isUndefined(a))return;"array"===n?_.isUndefined(t.items)?validateTypeAndFormat(e,a,n,t.format):validateTypeAndFormat(e,a,"array"===n?t.items.type:n,"array"===n&&t.items.format?t.items.format:t.format):validateTypeAndFormat(e,a,n,t.format),validateEnum(a,t["enum"]),validateMaximum(a,t.maximum,n,t.exclusiveMaximum),validateMaxItems(a,t.maxItems),validateMaxLength(a,t.maxLength),validateMaxProperties(a,t.maxProperties),validateMinimum(a,t.minimum,n,t.exclusiveMinimum),validateMinItems(a,t.minItems),validateMinLength(a,t.minLength),validateMinProperties(a,t.minProperties),validateMultipleOf(a,t.multipleOf),validatePattern(a,t.pattern),validateUniqueItems(a,t.uniqueItems)}catch(o){throw o.path=i,o}};

},{"./helpers":1,"lodash-compat/array/union":7,"lodash-compat/array/uniq":8,"lodash-compat/collection/each":9,"lodash-compat/collection/map":12,"lodash-compat/lang/cloneDeep":82,"lodash-compat/lang/isArray":84,"lodash-compat/lang/isBoolean":85,"lodash-compat/lang/isDate":86,"lodash-compat/lang/isFinite":87,"lodash-compat/lang/isNull":90,"lodash-compat/lang/isNumber":91,"lodash-compat/lang/isPlainObject":93,"lodash-compat/lang/isString":94,"lodash-compat/lang/isUndefined":96}],4:[function(require,module,exports){
var baseDifference=require("../internal/baseDifference"),baseFlatten=require("../internal/baseFlatten"),isArrayLike=require("../internal/isArrayLike"),isObjectLike=require("../internal/isObjectLike"),restParam=require("../function/restParam"),difference=restParam(function(e,r){return isObjectLike(e)&&isArrayLike(e)?baseDifference(e,baseFlatten(r,!1,!0)):[]});module.exports=difference;

},{"../function/restParam":14,"../internal/baseDifference":26,"../internal/baseFlatten":30,"../internal/isArrayLike":70,"../internal/isObjectLike":76}],5:[function(require,module,exports){
function indexOf(e,n,r){var a=e?e.length:0;if(!a)return-1;if("number"==typeof r)r=0>r?nativeMax(a+r,0):r;else if(r){var i=binaryIndex(e,n);return a>i&&(n===n?n===e[i]:e[i]!==e[i])?i:-1}return baseIndexOf(e,n,r||0)}var baseIndexOf=require("../internal/baseIndexOf"),binaryIndex=require("../internal/binaryIndex"),nativeMax=Math.max;module.exports=indexOf;

},{"../internal/baseIndexOf":35,"../internal/binaryIndex":48}],6:[function(require,module,exports){
function last(t){var e=t?t.length:0;return e?t[e-1]:void 0}module.exports=last;

},{}],7:[function(require,module,exports){
var baseFlatten=require("../internal/baseFlatten"),baseUniq=require("../internal/baseUniq"),restParam=require("../function/restParam"),union=restParam(function(e){return baseUniq(baseFlatten(e,!1,!0))});module.exports=union;

},{"../function/restParam":14,"../internal/baseFlatten":30,"../internal/baseUniq":47}],8:[function(require,module,exports){
function uniq(e,a,l,n){var r=e?e.length:0;return r?(null!=a&&"boolean"!=typeof a&&(n=l,l=isIterateeCall(e,a,n)?void 0:a,a=!1),l=null==l?l:baseCallback(l,n,3),a?sortedUniq(e,l):baseUniq(e,l)):[]}var baseCallback=require("../internal/baseCallback"),baseUniq=require("../internal/baseUniq"),isIterateeCall=require("../internal/isIterateeCall"),sortedUniq=require("../internal/sortedUniq");module.exports=uniq;

},{"../internal/baseCallback":23,"../internal/baseUniq":47,"../internal/isIterateeCall":73,"../internal/sortedUniq":79}],9:[function(require,module,exports){
module.exports=require("./forEach");

},{"./forEach":11}],10:[function(require,module,exports){
var baseEach=require("../internal/baseEach"),createFind=require("../internal/createFind"),find=createFind(baseEach);module.exports=find;

},{"../internal/baseEach":27,"../internal/createFind":57}],11:[function(require,module,exports){
var arrayEach=require("../internal/arrayEach"),baseEach=require("../internal/baseEach"),createForEach=require("../internal/createForEach"),forEach=createForEach(arrayEach,baseEach);module.exports=forEach;

},{"../internal/arrayEach":17,"../internal/baseEach":27,"../internal/createForEach":58}],12:[function(require,module,exports){
function map(a,r,e){var i=isArray(a)?arrayMap:baseMap;return r=baseCallback(r,e,3),i(a,r)}var arrayMap=require("../internal/arrayMap"),baseCallback=require("../internal/baseCallback"),baseMap=require("../internal/baseMap"),isArray=require("../lang/isArray");module.exports=map;

},{"../internal/arrayMap":18,"../internal/baseCallback":23,"../internal/baseMap":39,"../lang/isArray":84}],13:[function(require,module,exports){
var arrayReduce=require("../internal/arrayReduce"),baseEach=require("../internal/baseEach"),createReduce=require("../internal/createReduce"),reduce=createReduce(arrayReduce,baseEach);module.exports=reduce;

},{"../internal/arrayReduce":20,"../internal/baseEach":27,"../internal/createReduce":59}],14:[function(require,module,exports){
function restParam(r,t){if("function"!=typeof r)throw new TypeError(FUNC_ERROR_TEXT);return t=nativeMax(void 0===t?r.length-1:+t||0,0),function(){for(var a=arguments,e=-1,n=nativeMax(a.length-t,0),i=Array(n);++e<n;)i[e]=a[t+e];switch(t){case 0:return r.call(this,i);case 1:return r.call(this,a[0],i);case 2:return r.call(this,a[0],a[1],i)}var c=Array(t+1);for(e=-1;++e<t;)c[e]=a[e];return c[t]=i,r.apply(this,c)}}var FUNC_ERROR_TEXT="Expected a function",nativeMax=Math.max;module.exports=restParam;

},{}],15:[function(require,module,exports){
(function (global){
function SetCache(e){var t=e?e.length:0;for(this.data={hash:nativeCreate(null),set:new Set};t--;)this.push(e[t])}var cachePush=require("./cachePush"),getNative=require("./getNative"),Set=getNative(global,"Set"),nativeCreate=getNative(Object,"create");SetCache.prototype.push=cachePush,module.exports=SetCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./cachePush":53,"./getNative":65}],16:[function(require,module,exports){
function arrayCopy(r,a){var o=-1,y=r.length;for(a||(a=Array(y));++o<y;)a[o]=r[o];return a}module.exports=arrayCopy;

},{}],17:[function(require,module,exports){
function arrayEach(r,a){for(var e=-1,n=r.length;++e<n&&a(r[e],e,r)!==!1;);return r}module.exports=arrayEach;

},{}],18:[function(require,module,exports){
function arrayMap(r,a){for(var e=-1,n=r.length,o=Array(n);++e<n;)o[e]=a(r[e],e,r);return o}module.exports=arrayMap;

},{}],19:[function(require,module,exports){
function arrayPush(r,a){for(var e=-1,n=a.length,t=r.length;++e<n;)r[t+e]=a[e];return r}module.exports=arrayPush;

},{}],20:[function(require,module,exports){
function arrayReduce(r,e,a,u){var n=-1,o=r.length;for(u&&o&&(a=r[++n]);++n<o;)a=e(a,r[n],n,r);return a}module.exports=arrayReduce;

},{}],21:[function(require,module,exports){
function arraySome(r,e){for(var o=-1,a=r.length;++o<a;)if(e(r[o],o,r))return!0;return!1}module.exports=arraySome;

},{}],22:[function(require,module,exports){
function baseAssign(e,s){return null==s?e:baseCopy(s,keys(s),e)}var baseCopy=require("./baseCopy"),keys=require("../object/keys");module.exports=baseAssign;

},{"../object/keys":98,"./baseCopy":25}],23:[function(require,module,exports){
function baseCallback(e,t,r){var a=typeof e;return"function"==a?void 0===t?e:bindCallback(e,t,r):null==e?identity:"object"==a?baseMatches(e):void 0===t?property(e):baseMatchesProperty(e,t)}var baseMatches=require("./baseMatches"),baseMatchesProperty=require("./baseMatchesProperty"),bindCallback=require("./bindCallback"),identity=require("../utility/identity"),property=require("../utility/property");module.exports=baseCallback;

},{"../utility/identity":102,"../utility/property":103,"./baseMatches":40,"./baseMatchesProperty":41,"./bindCallback":50}],24:[function(require,module,exports){
function baseClone(a,e,r,t,o,n,g){var l;if(r&&(l=o?r(a,t,o):r(a)),void 0!==l)return l;if(!isObject(a))return a;var b=isArray(a);if(b){if(l=initCloneArray(a),!e)return arrayCopy(a,l)}else{var T=objToString.call(a),i=T==funcTag;if(T!=objectTag&&T!=argsTag&&(!i||o))return cloneableTags[T]?initCloneByTag(a,T,e):o?a:{};if(isHostObject(a))return o?a:{};if(l=initCloneObject(i?{}:a),!e)return baseAssign(l,a)}n||(n=[]),g||(g=[]);for(var c=n.length;c--;)if(n[c]==a)return g[c];return n.push(a),g.push(l),(b?arrayEach:baseForOwn)(a,function(t,o){l[o]=baseClone(t,e,r,o,a,n,g)}),l}var arrayCopy=require("./arrayCopy"),arrayEach=require("./arrayEach"),baseAssign=require("./baseAssign"),baseForOwn=require("./baseForOwn"),initCloneArray=require("./initCloneArray"),initCloneByTag=require("./initCloneByTag"),initCloneObject=require("./initCloneObject"),isArray=require("../lang/isArray"),isHostObject=require("./isHostObject"),isObject=require("../lang/isObject"),argsTag="[object Arguments]",arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",mapTag="[object Map]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",setTag="[object Set]",stringTag="[object String]",weakMapTag="[object WeakMap]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",cloneableTags={};cloneableTags[argsTag]=cloneableTags[arrayTag]=cloneableTags[arrayBufferTag]=cloneableTags[boolTag]=cloneableTags[dateTag]=cloneableTags[float32Tag]=cloneableTags[float64Tag]=cloneableTags[int8Tag]=cloneableTags[int16Tag]=cloneableTags[int32Tag]=cloneableTags[numberTag]=cloneableTags[objectTag]=cloneableTags[regexpTag]=cloneableTags[stringTag]=cloneableTags[uint8Tag]=cloneableTags[uint8ClampedTag]=cloneableTags[uint16Tag]=cloneableTags[uint32Tag]=!0,cloneableTags[errorTag]=cloneableTags[funcTag]=cloneableTags[mapTag]=cloneableTags[setTag]=cloneableTags[weakMapTag]=!1;var objectProto=Object.prototype,objToString=objectProto.toString;module.exports=baseClone;

},{"../lang/isArray":84,"../lang/isObject":92,"./arrayCopy":16,"./arrayEach":17,"./baseAssign":22,"./baseForOwn":33,"./initCloneArray":67,"./initCloneByTag":68,"./initCloneObject":69,"./isHostObject":71}],25:[function(require,module,exports){
function baseCopy(e,o,r){r||(r={});for(var a=-1,n=o.length;++a<n;){var t=o[a];r[t]=e[t]}return r}module.exports=baseCopy;

},{}],26:[function(require,module,exports){
function baseDifference(e,r){var a=e?e.length:0,n=[];if(!a)return n;var c=-1,f=baseIndexOf,h=!0,t=h&&r.length>=LARGE_ARRAY_SIZE?createCache(r):null,u=r.length;t&&(f=cacheIndexOf,h=!1,r=t);e:for(;++c<a;){var i=e[c];if(h&&i===i){for(var s=u;s--;)if(r[s]===i)continue e;n.push(i)}else f(r,i,0)<0&&n.push(i)}return n}var baseIndexOf=require("./baseIndexOf"),cacheIndexOf=require("./cacheIndexOf"),createCache=require("./createCache"),LARGE_ARRAY_SIZE=200;module.exports=baseDifference;

},{"./baseIndexOf":35,"./cacheIndexOf":52,"./createCache":56}],27:[function(require,module,exports){
var baseForOwn=require("./baseForOwn"),createBaseEach=require("./createBaseEach"),baseEach=createBaseEach(baseForOwn);module.exports=baseEach;

},{"./baseForOwn":33,"./createBaseEach":54}],28:[function(require,module,exports){
function baseFind(n,e,r,i){var o;return r(n,function(n,r,t){return e(n,r,t)?(o=i?r:n,!1):void 0}),o}module.exports=baseFind;

},{}],29:[function(require,module,exports){
function baseFindIndex(e,n,r){for(var d=e.length,t=r?d:-1;r?t--:++t<d;)if(n(e[t],t,e))return t;return-1}module.exports=baseFindIndex;

},{}],30:[function(require,module,exports){
function baseFlatten(r,e,i,a){a||(a=[]);for(var s=-1,t=r.length;++s<t;){var u=r[s];isObjectLike(u)&&isArrayLike(u)&&(i||isArray(u)||isArguments(u))?e?baseFlatten(u,e,i,a):arrayPush(a,u):i||(a[a.length]=u)}return a}var arrayPush=require("./arrayPush"),isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isArrayLike=require("./isArrayLike"),isObjectLike=require("./isObjectLike");module.exports=baseFlatten;

},{"../lang/isArguments":83,"../lang/isArray":84,"./arrayPush":19,"./isArrayLike":70,"./isObjectLike":76}],31:[function(require,module,exports){
var createBaseFor=require("./createBaseFor"),baseFor=createBaseFor();module.exports=baseFor;

},{"./createBaseFor":55}],32:[function(require,module,exports){
function baseForIn(e,r){return baseFor(e,r,keysIn)}var baseFor=require("./baseFor"),keysIn=require("../object/keysIn");module.exports=baseForIn;

},{"../object/keysIn":99,"./baseFor":31}],33:[function(require,module,exports){
function baseForOwn(e,r){return baseFor(e,r,keys)}var baseFor=require("./baseFor"),keys=require("../object/keys");module.exports=baseForOwn;

},{"../object/keys":98,"./baseFor":31}],34:[function(require,module,exports){
function baseGet(e,t,o){if(null!=e){e=toObject(e),void 0!==o&&o in e&&(t=[o]);for(var r=0,n=t.length;null!=e&&n>r;)e=toObject(e)[t[r++]];return r&&r==n?e:void 0}}var toObject=require("./toObject");module.exports=baseGet;

},{"./toObject":80}],35:[function(require,module,exports){
function baseIndexOf(e,r,n){if(r!==r)return indexOfNaN(e,n);for(var f=n-1,a=e.length;++f<a;)if(e[f]===r)return f;return-1}var indexOfNaN=require("./indexOfNaN");module.exports=baseIndexOf;

},{"./indexOfNaN":66}],36:[function(require,module,exports){
function baseIsEqual(e,s,a,u,i,b){return e===s?!0:null==e||null==s||!isObject(e)&&!isObjectLike(s)?e!==e&&s!==s:baseIsEqualDeep(e,s,baseIsEqual,a,u,i,b)}var baseIsEqualDeep=require("./baseIsEqualDeep"),isObject=require("../lang/isObject"),isObjectLike=require("./isObjectLike");module.exports=baseIsEqual;

},{"../lang/isObject":92,"./baseIsEqualDeep":37,"./isObjectLike":76}],37:[function(require,module,exports){
function baseIsEqualDeep(r,e,a,t,o,s,u){var i=isArray(r),b=isArray(e),c=arrayTag,g=arrayTag;i||(c=objToString.call(r),c==argsTag?c=objectTag:c!=objectTag&&(i=isTypedArray(r))),b||(g=objToString.call(e),g==argsTag?g=objectTag:g!=objectTag&&(b=isTypedArray(e)));var y=c==objectTag&&!isHostObject(r),j=g==objectTag&&!isHostObject(e),l=c==g;if(l&&!i&&!y)return equalByTag(r,e,c);if(!o){var p=y&&hasOwnProperty.call(r,"__wrapped__"),T=j&&hasOwnProperty.call(e,"__wrapped__");if(p||T)return a(p?r.value():r,T?e.value():e,t,o,s,u)}if(!l)return!1;s||(s=[]),u||(u=[]);for(var n=s.length;n--;)if(s[n]==r)return u[n]==e;s.push(r),u.push(e);var q=(i?equalArrays:equalObjects)(r,e,a,t,o,s,u);return s.pop(),u.pop(),q}var equalArrays=require("./equalArrays"),equalByTag=require("./equalByTag"),equalObjects=require("./equalObjects"),isArray=require("../lang/isArray"),isHostObject=require("./isHostObject"),isTypedArray=require("../lang/isTypedArray"),argsTag="[object Arguments]",arrayTag="[object Array]",objectTag="[object Object]",objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString;module.exports=baseIsEqualDeep;

},{"../lang/isArray":84,"../lang/isTypedArray":95,"./equalArrays":60,"./equalByTag":61,"./equalObjects":62,"./isHostObject":71}],38:[function(require,module,exports){
function baseIsMatch(e,r,t){var a=r.length,i=a,u=!t;if(null==e)return!i;for(e=toObject(e);a--;){var s=r[a];if(u&&s[2]?s[1]!==e[s[0]]:!(s[0]in e))return!1}for(;++a<i;){s=r[a];var n=s[0],o=e[n],b=s[1];if(u&&s[2]){if(void 0===o&&!(n in e))return!1}else{var f=t?t(o,b,n):void 0;if(!(void 0===f?baseIsEqual(b,o,t,!0):f))return!1}}return!0}var baseIsEqual=require("./baseIsEqual"),toObject=require("./toObject");module.exports=baseIsMatch;

},{"./baseIsEqual":36,"./toObject":80}],39:[function(require,module,exports){
function baseMap(r,a){var e=-1,i=isArrayLike(r)?Array(r.length):[];return baseEach(r,function(r,s,n){i[++e]=a(r,s,n)}),i}var baseEach=require("./baseEach"),isArrayLike=require("./isArrayLike");module.exports=baseMap;

},{"./baseEach":27,"./isArrayLike":70}],40:[function(require,module,exports){
function baseMatches(t){var e=getMatchData(t);if(1==e.length&&e[0][2]){var a=e[0][0],r=e[0][1];return function(t){return null==t?!1:(t=toObject(t),t[a]===r&&(void 0!==r||a in t))}}return function(t){return baseIsMatch(t,e)}}var baseIsMatch=require("./baseIsMatch"),getMatchData=require("./getMatchData"),toObject=require("./toObject");module.exports=baseMatches;

},{"./baseIsMatch":38,"./getMatchData":64,"./toObject":80}],41:[function(require,module,exports){
function baseMatchesProperty(e,r){var t=isArray(e),a=isKey(e)&&isStrictComparable(r),i=e+"";return e=toPath(e),function(s){if(null==s)return!1;var u=i;if(s=toObject(s),!(!t&&a||u in s)){if(s=1==e.length?s:baseGet(s,baseSlice(e,0,-1)),null==s)return!1;u=last(e),s=toObject(s)}return s[u]===r?void 0!==r||u in s:baseIsEqual(r,s[u],void 0,!0)}}var baseGet=require("./baseGet"),baseIsEqual=require("./baseIsEqual"),baseSlice=require("./baseSlice"),isArray=require("../lang/isArray"),isKey=require("./isKey"),isStrictComparable=require("./isStrictComparable"),last=require("../array/last"),toObject=require("./toObject"),toPath=require("./toPath");module.exports=baseMatchesProperty;

},{"../array/last":6,"../lang/isArray":84,"./baseGet":34,"./baseIsEqual":36,"./baseSlice":45,"./isKey":74,"./isStrictComparable":77,"./toObject":80,"./toPath":81}],42:[function(require,module,exports){
function baseProperty(e){return function(t){return null==t?void 0:toObject(t)[e]}}var toObject=require("./toObject");module.exports=baseProperty;

},{"./toObject":80}],43:[function(require,module,exports){
function basePropertyDeep(e){var t=e+"";return e=toPath(e),function(r){return baseGet(r,e,t)}}var baseGet=require("./baseGet"),toPath=require("./toPath");module.exports=basePropertyDeep;

},{"./baseGet":34,"./toPath":81}],44:[function(require,module,exports){
function baseReduce(e,u,n,c,o){return o(e,function(e,o,t){n=c?(c=!1,e):u(n,e,o,t)}),n}module.exports=baseReduce;

},{}],45:[function(require,module,exports){
function baseSlice(e,r,l){var a=-1,n=e.length;r=null==r?0:+r||0,0>r&&(r=-r>n?0:n+r),l=void 0===l||l>n?n:+l||0,0>l&&(l+=n),n=r>l?0:l-r>>>0,r>>>=0;for(var o=Array(n);++a<n;)o[a]=e[a+r];return o}module.exports=baseSlice;

},{}],46:[function(require,module,exports){
function baseToString(n){return null==n?"":n+""}module.exports=baseToString;

},{}],47:[function(require,module,exports){
function baseUniq(e,a){var r=-1,n=baseIndexOf,c=e.length,h=!0,u=h&&c>=LARGE_ARRAY_SIZE,f=u?createCache():null,s=[];f?(n=cacheIndexOf,h=!1):(u=!1,f=a?[]:s);e:for(;++r<c;){var i=e[r],t=a?a(i,r,e):i;if(h&&i===i){for(var I=f.length;I--;)if(f[I]===t)continue e;a&&f.push(t),s.push(i)}else n(f,t,0)<0&&((a||u)&&f.push(t),s.push(i))}return s}var baseIndexOf=require("./baseIndexOf"),cacheIndexOf=require("./cacheIndexOf"),createCache=require("./createCache"),LARGE_ARRAY_SIZE=200;module.exports=baseUniq;

},{"./baseIndexOf":35,"./cacheIndexOf":52,"./createCache":56}],48:[function(require,module,exports){
function binaryIndex(n,e,r){var i=0,t=n?n.length:i;if("number"==typeof e&&e===e&&HALF_MAX_ARRAY_LENGTH>=t){for(;t>i;){var A=i+t>>>1,y=n[A];(r?e>=y:e>y)&&null!==y?i=A+1:t=A}return t}return binaryIndexBy(n,e,identity,r)}var binaryIndexBy=require("./binaryIndexBy"),identity=require("../utility/identity"),MAX_ARRAY_LENGTH=4294967295,HALF_MAX_ARRAY_LENGTH=MAX_ARRAY_LENGTH>>>1;module.exports=binaryIndex;

},{"../utility/identity":102,"./binaryIndexBy":49}],49:[function(require,module,exports){
function binaryIndexBy(n,i,r,a){i=r(i);for(var e=0,l=n?n.length:0,o=i!==i,A=null===i,t=void 0===i;l>e;){var v=nativeFloor((e+l)/2),M=r(n[v]),R=void 0!==M,_=M===M;if(o)var u=_||a;else u=A?_&&R&&(a||null!=M):t?_&&(a||R):null==M?!1:a?i>=M:i>M;u?e=v+1:l=v}return nativeMin(l,MAX_ARRAY_INDEX)}var nativeFloor=Math.floor,nativeMin=Math.min,MAX_ARRAY_LENGTH=4294967295,MAX_ARRAY_INDEX=MAX_ARRAY_LENGTH-1;module.exports=binaryIndexBy;

},{}],50:[function(require,module,exports){
function bindCallback(n,t,r){if("function"!=typeof n)return identity;if(void 0===t)return n;switch(r){case 1:return function(r){return n.call(t,r)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,i){return n.call(t,r,e,u,i)};case 5:return function(r,e,u,i,c){return n.call(t,r,e,u,i,c)}}return function(){return n.apply(t,arguments)}}var identity=require("../utility/identity");module.exports=bindCallback;

},{"../utility/identity":102}],51:[function(require,module,exports){
(function (global){
function bufferClone(r){var e=new ArrayBuffer(r.byteLength),n=new Uint8Array(e);return n.set(new Uint8Array(r)),e}var ArrayBuffer=global.ArrayBuffer,Uint8Array=global.Uint8Array;module.exports=bufferClone;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],52:[function(require,module,exports){
function cacheIndexOf(e,t){var a=e.data,c="string"==typeof t||isObject(t)?a.set.has(t):a.hash[t];return c?0:-1}var isObject=require("../lang/isObject");module.exports=cacheIndexOf;

},{"../lang/isObject":92}],53:[function(require,module,exports){
function cachePush(e){var s=this.data;"string"==typeof e||isObject(e)?s.set.add(e):s.hash[e]=!0}var isObject=require("../lang/isObject");module.exports=cachePush;

},{"../lang/isObject":92}],54:[function(require,module,exports){
function createBaseEach(e,t){return function(r,n){var a=r?getLength(r):0;if(!isLength(a))return e(r,n);for(var c=t?a:-1,g=toObject(r);(t?c--:++c<a)&&n(g[c],c,g)!==!1;);return r}}var getLength=require("./getLength"),isLength=require("./isLength"),toObject=require("./toObject");module.exports=createBaseEach;

},{"./getLength":63,"./isLength":75,"./toObject":80}],55:[function(require,module,exports){
function createBaseFor(e){return function(r,t,o){for(var a=toObject(r),c=o(r),n=c.length,u=e?n:-1;e?u--:++u<n;){var b=c[u];if(t(a[b],b,a)===!1)break}return r}}var toObject=require("./toObject");module.exports=createBaseFor;

},{"./toObject":80}],56:[function(require,module,exports){
(function (global){
function createCache(e){return nativeCreate&&Set?new SetCache(e):null}var SetCache=require("./SetCache"),getNative=require("./getNative"),Set=getNative(global,"Set"),nativeCreate=getNative(Object,"create");module.exports=createCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./SetCache":15,"./getNative":65}],57:[function(require,module,exports){
function createFind(e,r){return function(a,i,n){if(i=baseCallback(i,n,3),isArray(a)){var d=baseFindIndex(a,i,r);return d>-1?a[d]:void 0}return baseFind(a,i,e)}}var baseCallback=require("./baseCallback"),baseFind=require("./baseFind"),baseFindIndex=require("./baseFindIndex"),isArray=require("../lang/isArray");module.exports=createFind;

},{"../lang/isArray":84,"./baseCallback":23,"./baseFind":28,"./baseFindIndex":29}],58:[function(require,module,exports){
function createForEach(r,a){return function(e,i,n){return"function"==typeof i&&void 0===n&&isArray(e)?r(e,i):a(e,bindCallback(i,n,3))}}var bindCallback=require("./bindCallback"),isArray=require("../lang/isArray");module.exports=createForEach;

},{"../lang/isArray":84,"./bindCallback":50}],59:[function(require,module,exports){
function createReduce(e,r){return function(a,u,c,n){var s=arguments.length<3;return"function"==typeof u&&void 0===n&&isArray(a)?e(a,u,c,s):baseReduce(a,baseCallback(u,n,4),c,s,r)}}var baseCallback=require("./baseCallback"),baseReduce=require("./baseReduce"),isArray=require("../lang/isArray");module.exports=createReduce;

},{"../lang/isArray":84,"./baseCallback":23,"./baseReduce":44}],60:[function(require,module,exports){
function equalArrays(r,e,n,a,u,i,t){var o=-1,f=r.length,l=e.length;if(f!=l&&!(u&&l>f))return!1;for(;++o<f;){var v=r[o],y=e[o],m=a?a(u?y:v,u?v:y,o):void 0;if(void 0!==m){if(m)continue;return!1}if(u){if(!arraySome(e,function(r){return v===r||n(v,r,a,u,i,t)}))return!1}else if(v!==y&&!n(v,y,a,u,i,t))return!1}return!0}var arraySome=require("./arraySome");module.exports=equalArrays;

},{"./arraySome":21}],61:[function(require,module,exports){
function equalByTag(e,a,r){switch(r){case boolTag:case dateTag:return+e==+a;case errorTag:return e.name==a.name&&e.message==a.message;case numberTag:return e!=+e?a!=+a:e==+a;case regexpTag:case stringTag:return e==a+""}return!1}var boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",numberTag="[object Number]",regexpTag="[object RegExp]",stringTag="[object String]";module.exports=equalByTag;

},{}],62:[function(require,module,exports){
function equalObjects(r,t,o,e,n,c,s){var u=keys(r),i=u.length,a=keys(t),f=a.length;if(i!=f&&!n)return!1;for(var y=i;y--;){var v=u[y];if(!(n?v in t:hasOwnProperty.call(t,v)))return!1}for(var p=n;++y<i;){v=u[y];var l=r[v],b=t[v],j=e?e(n?b:l,n?l:b,v):void 0;if(!(void 0===j?o(l,b,e,n,c,s):j))return!1;p||(p="constructor"==v)}if(!p){var O=r.constructor,h=t.constructor;if(O!=h&&"constructor"in r&&"constructor"in t&&!("function"==typeof O&&O instanceof O&&"function"==typeof h&&h instanceof h))return!1}return!0}var keys=require("../object/keys"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=equalObjects;

},{"../object/keys":98}],63:[function(require,module,exports){
var baseProperty=require("./baseProperty"),getLength=baseProperty("length");module.exports=getLength;

},{"./baseProperty":42}],64:[function(require,module,exports){
function getMatchData(r){for(var a=pairs(r),t=a.length;t--;)a[t][2]=isStrictComparable(a[t][1]);return a}var isStrictComparable=require("./isStrictComparable"),pairs=require("../object/pairs");module.exports=getMatchData;

},{"../object/pairs":100,"./isStrictComparable":77}],65:[function(require,module,exports){
function getNative(e,i){var t=null==e?void 0:e[i];return isNative(t)?t:void 0}var isNative=require("../lang/isNative");module.exports=getNative;

},{"../lang/isNative":89}],66:[function(require,module,exports){
function indexOfNaN(r,e,n){for(var f=r.length,t=e+(n?0:-1);n?t--:++t<f;){var a=r[t];if(a!==a)return t}return-1}module.exports=indexOfNaN;

},{}],67:[function(require,module,exports){
function initCloneArray(t){var r=t.length,n=new t.constructor(r);return r&&"string"==typeof t[0]&&hasOwnProperty.call(t,"index")&&(n.index=t.index,n.input=t.input),n}var objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=initCloneArray;

},{}],68:[function(require,module,exports){
(function (global){
function initCloneByTag(a,t,r){var e=a.constructor;switch(t){case arrayBufferTag:return bufferClone(a);case boolTag:case dateTag:return new e(+a);case float32Tag:case float64Tag:case int8Tag:case int16Tag:case int32Tag:case uint8Tag:case uint8ClampedTag:case uint16Tag:case uint32Tag:e instanceof e&&(e=ctorByTag[t]);var g=a.buffer;return new e(r?bufferClone(g):g,a.byteOffset,a.length);case numberTag:case stringTag:return new e(a);case regexpTag:var n=new e(a.source,reFlags.exec(a));n.lastIndex=a.lastIndex}return n}var bufferClone=require("./bufferClone"),boolTag="[object Boolean]",dateTag="[object Date]",numberTag="[object Number]",regexpTag="[object RegExp]",stringTag="[object String]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",reFlags=/\w*$/,Uint8Array=global.Uint8Array,ctorByTag={};ctorByTag[float32Tag]=global.Float32Array,ctorByTag[float64Tag]=global.Float64Array,ctorByTag[int8Tag]=global.Int8Array,ctorByTag[int16Tag]=global.Int16Array,ctorByTag[int32Tag]=global.Int32Array,ctorByTag[uint8Tag]=Uint8Array,ctorByTag[uint8ClampedTag]=global.Uint8ClampedArray,ctorByTag[uint16Tag]=global.Uint16Array,ctorByTag[uint32Tag]=global.Uint32Array,module.exports=initCloneByTag;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./bufferClone":51}],69:[function(require,module,exports){
function initCloneObject(n){var t=n.constructor;return"function"==typeof t&&t instanceof t||(t=Object),new t}module.exports=initCloneObject;

},{}],70:[function(require,module,exports){
function isArrayLike(e){return null!=e&&isLength(getLength(e))}var getLength=require("./getLength"),isLength=require("./isLength");module.exports=isArrayLike;

},{"./getLength":63,"./isLength":75}],71:[function(require,module,exports){
var isHostObject=function(){try{Object({toString:0}+"")}catch(t){return function(){return!1}}return function(t){return"function"!=typeof t.toString&&"string"==typeof(t+"")}}();module.exports=isHostObject;

},{}],72:[function(require,module,exports){
function isIndex(e,n){return e="number"==typeof e||reIsUint.test(e)?+e:-1,n=null==n?MAX_SAFE_INTEGER:n,e>-1&&e%1==0&&n>e}var reIsUint=/^\d+$/,MAX_SAFE_INTEGER=9007199254740991;module.exports=isIndex;

},{}],73:[function(require,module,exports){
function isIterateeCall(e,r,i){if(!isObject(i))return!1;var t=typeof r;if("number"==t?isArrayLike(i)&&isIndex(r,i.length):"string"==t&&r in i){var n=i[r];return e===e?e===n:n!==n}return!1}var isArrayLike=require("./isArrayLike"),isIndex=require("./isIndex"),isObject=require("../lang/isObject");module.exports=isIterateeCall;

},{"../lang/isObject":92,"./isArrayLike":70,"./isIndex":72}],74:[function(require,module,exports){
function isKey(r,e){var t=typeof r;if("string"==t&&reIsPlainProp.test(r)||"number"==t)return!0;if(isArray(r))return!1;var i=!reIsDeepProp.test(r);return i||null!=e&&r in toObject(e)}var isArray=require("../lang/isArray"),toObject=require("./toObject"),reIsDeepProp=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,reIsPlainProp=/^\w*$/;module.exports=isKey;

},{"../lang/isArray":84,"./toObject":80}],75:[function(require,module,exports){
function isLength(e){return"number"==typeof e&&e>-1&&e%1==0&&MAX_SAFE_INTEGER>=e}var MAX_SAFE_INTEGER=9007199254740991;module.exports=isLength;

},{}],76:[function(require,module,exports){
function isObjectLike(e){return!!e&&"object"==typeof e}module.exports=isObjectLike;

},{}],77:[function(require,module,exports){
function isStrictComparable(e){return e===e&&!isObject(e)}var isObject=require("../lang/isObject");module.exports=isStrictComparable;

},{"../lang/isObject":92}],78:[function(require,module,exports){
function shimKeys(r){for(var e=keysIn(r),s=e.length,i=s&&r.length,n=!!i&&isLength(i)&&(isArray(r)||isArguments(r)||isString(r)),t=-1,o=[];++t<s;){var g=e[t];(n&&isIndex(g,i)||hasOwnProperty.call(r,g))&&o.push(g)}return o}var isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isIndex=require("./isIndex"),isLength=require("./isLength"),isString=require("../lang/isString"),keysIn=require("../object/keysIn"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=shimKeys;

},{"../lang/isArguments":83,"../lang/isArray":84,"../lang/isString":94,"../object/keysIn":99,"./isIndex":72,"./isLength":75}],79:[function(require,module,exports){
function sortedUniq(r,e){for(var n,o=-1,t=r.length,d=-1,i=[];++o<t;){var s=r[o],u=e?e(s,o,r):s;o&&n===u||(n=u,i[++d]=s)}return i}module.exports=sortedUniq;

},{}],80:[function(require,module,exports){
function toObject(r){if(support.unindexedChars&&isString(r)){for(var t=-1,e=r.length,i=Object(r);++t<e;)i[t]=r.charAt(t);return i}return isObject(r)?r:Object(r)}var isObject=require("../lang/isObject"),isString=require("../lang/isString"),support=require("../support");module.exports=toObject;

},{"../lang/isObject":92,"../lang/isString":94,"../support":101}],81:[function(require,module,exports){
function toPath(r){if(isArray(r))return r;var e=[];return baseToString(r).replace(rePropName,function(r,a,t,i){e.push(t?i.replace(reEscapeChar,"$1"):a||r)}),e}var baseToString=require("./baseToString"),isArray=require("../lang/isArray"),rePropName=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g,reEscapeChar=/\\(\\)?/g;module.exports=toPath;

},{"../lang/isArray":84,"./baseToString":46}],82:[function(require,module,exports){
function cloneDeep(e,n,l){return"function"==typeof n?baseClone(e,!0,bindCallback(n,l,1)):baseClone(e,!0)}var baseClone=require("../internal/baseClone"),bindCallback=require("../internal/bindCallback");module.exports=cloneDeep;

},{"../internal/baseClone":24,"../internal/bindCallback":50}],83:[function(require,module,exports){
function isArguments(e){return isObjectLike(e)&&isArrayLike(e)&&hasOwnProperty.call(e,"callee")&&!propertyIsEnumerable.call(e,"callee")}var isArrayLike=require("../internal/isArrayLike"),isObjectLike=require("../internal/isObjectLike"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,propertyIsEnumerable=objectProto.propertyIsEnumerable;module.exports=isArguments;

},{"../internal/isArrayLike":70,"../internal/isObjectLike":76}],84:[function(require,module,exports){
var getNative=require("../internal/getNative"),isLength=require("../internal/isLength"),isObjectLike=require("../internal/isObjectLike"),arrayTag="[object Array]",objectProto=Object.prototype,objToString=objectProto.toString,nativeIsArray=getNative(Array,"isArray"),isArray=nativeIsArray||function(r){return isObjectLike(r)&&isLength(r.length)&&objToString.call(r)==arrayTag};module.exports=isArray;

},{"../internal/getNative":65,"../internal/isLength":75,"../internal/isObjectLike":76}],85:[function(require,module,exports){
function isBoolean(o){return o===!0||o===!1||isObjectLike(o)&&objToString.call(o)==boolTag}var isObjectLike=require("../internal/isObjectLike"),boolTag="[object Boolean]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isBoolean;

},{"../internal/isObjectLike":76}],86:[function(require,module,exports){
function isDate(t){return isObjectLike(t)&&objToString.call(t)==dateTag}var isObjectLike=require("../internal/isObjectLike"),dateTag="[object Date]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isDate;

},{"../internal/isObjectLike":76}],87:[function(require,module,exports){
(function (global){
function isFinite(i){return"number"==typeof i&&nativeIsFinite(i)}var nativeIsFinite=global.isFinite;module.exports=isFinite;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],88:[function(require,module,exports){
function isFunction(t){return isObject(t)&&objToString.call(t)==funcTag}var isObject=require("./isObject"),funcTag="[object Function]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isFunction;

},{"./isObject":92}],89:[function(require,module,exports){
function isNative(t){return null==t?!1:isFunction(t)?reIsNative.test(fnToString.call(t)):isObjectLike(t)&&(isHostObject(t)?reIsNative:reIsHostCtor).test(t)}var isFunction=require("./isFunction"),isHostObject=require("../internal/isHostObject"),isObjectLike=require("../internal/isObjectLike"),reIsHostCtor=/^\[object .+?Constructor\]$/,objectProto=Object.prototype,fnToString=Function.prototype.toString,hasOwnProperty=objectProto.hasOwnProperty,reIsNative=RegExp("^"+fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$");module.exports=isNative;

},{"../internal/isHostObject":71,"../internal/isObjectLike":76,"./isFunction":88}],90:[function(require,module,exports){
function isNull(l){return null===l}module.exports=isNull;

},{}],91:[function(require,module,exports){
function isNumber(e){return"number"==typeof e||isObjectLike(e)&&objToString.call(e)==numberTag}var isObjectLike=require("../internal/isObjectLike"),numberTag="[object Number]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isNumber;

},{"../internal/isObjectLike":76}],92:[function(require,module,exports){
function isObject(t){var e=typeof t;return!!t&&("object"==e||"function"==e)}module.exports=isObject;

},{}],93:[function(require,module,exports){
function isPlainObject(t){var r;if(!isObjectLike(t)||objToString.call(t)!=objectTag||isHostObject(t)||isArguments(t)||!hasOwnProperty.call(t,"constructor")&&(r=t.constructor,"function"==typeof r&&!(r instanceof r)))return!1;var e;return support.ownLast?(baseForIn(t,function(t,r,o){return e=hasOwnProperty.call(o,r),!1}),e!==!1):(baseForIn(t,function(t,r){e=r}),void 0===e||hasOwnProperty.call(t,e))}var baseForIn=require("../internal/baseForIn"),isArguments=require("./isArguments"),isHostObject=require("../internal/isHostObject"),isObjectLike=require("../internal/isObjectLike"),support=require("../support"),objectTag="[object Object]",objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString;module.exports=isPlainObject;

},{"../internal/baseForIn":32,"../internal/isHostObject":71,"../internal/isObjectLike":76,"../support":101,"./isArguments":83}],94:[function(require,module,exports){
function isString(t){return"string"==typeof t||isObjectLike(t)&&objToString.call(t)==stringTag}var isObjectLike=require("../internal/isObjectLike"),stringTag="[object String]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isString;

},{"../internal/isObjectLike":76}],95:[function(require,module,exports){
function isTypedArray(a){return isObjectLike(a)&&isLength(a.length)&&!!typedArrayTags[objToString.call(a)]}var isLength=require("../internal/isLength"),isObjectLike=require("../internal/isObjectLike"),argsTag="[object Arguments]",arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",mapTag="[object Map]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",setTag="[object Set]",stringTag="[object String]",weakMapTag="[object WeakMap]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",typedArrayTags={};typedArrayTags[float32Tag]=typedArrayTags[float64Tag]=typedArrayTags[int8Tag]=typedArrayTags[int16Tag]=typedArrayTags[int32Tag]=typedArrayTags[uint8Tag]=typedArrayTags[uint8ClampedTag]=typedArrayTags[uint16Tag]=typedArrayTags[uint32Tag]=!0,typedArrayTags[argsTag]=typedArrayTags[arrayTag]=typedArrayTags[arrayBufferTag]=typedArrayTags[boolTag]=typedArrayTags[dateTag]=typedArrayTags[errorTag]=typedArrayTags[funcTag]=typedArrayTags[mapTag]=typedArrayTags[numberTag]=typedArrayTags[objectTag]=typedArrayTags[regexpTag]=typedArrayTags[setTag]=typedArrayTags[stringTag]=typedArrayTags[weakMapTag]=!1;var objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isTypedArray;

},{"../internal/isLength":75,"../internal/isObjectLike":76}],96:[function(require,module,exports){
function isUndefined(e){return void 0===e}module.exports=isUndefined;

},{}],97:[function(require,module,exports){
function has(e,r){if(null==e)return!1;var t=hasOwnProperty.call(e,r);if(!t&&!isKey(r)){if(r=toPath(r),e=1==r.length?e:baseGet(e,baseSlice(r,0,-1)),null==e)return!1;r=last(r),t=hasOwnProperty.call(e,r)}return t||isLength(e.length)&&isIndex(r,e.length)&&(isArray(e)||isArguments(e)||isString(e))}var baseGet=require("../internal/baseGet"),baseSlice=require("../internal/baseSlice"),isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isIndex=require("../internal/isIndex"),isKey=require("../internal/isKey"),isLength=require("../internal/isLength"),isString=require("../lang/isString"),last=require("../array/last"),toPath=require("../internal/toPath"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=has;

},{"../array/last":6,"../internal/baseGet":34,"../internal/baseSlice":45,"../internal/isIndex":72,"../internal/isKey":74,"../internal/isLength":75,"../internal/toPath":81,"../lang/isArguments":83,"../lang/isArray":84,"../lang/isString":94}],98:[function(require,module,exports){
var getNative=require("../internal/getNative"),isArrayLike=require("../internal/isArrayLike"),isObject=require("../lang/isObject"),shimKeys=require("../internal/shimKeys"),support=require("../support"),nativeKeys=getNative(Object,"keys"),keys=nativeKeys?function(e){var t=null==e?void 0:e.constructor;return"function"==typeof t&&t.prototype===e||("function"==typeof e?support.enumPrototypes:isArrayLike(e))?shimKeys(e):isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;

},{"../internal/getNative":65,"../internal/isArrayLike":70,"../internal/shimKeys":78,"../lang/isObject":92,"../support":101}],99:[function(require,module,exports){
function keysIn(r){if(null==r)return[];isObject(r)||(r=Object(r));var o=r.length;o=o&&isLength(o)&&(isArray(r)||isArguments(r)||isString(r))&&o||0;for(var n=r.constructor,t=-1,e=isFunction(n)&&n.prototype||objectProto,a=e===r,s=Array(o),i=o>0,u=support.enumErrorProps&&(r===errorProto||r instanceof Error),c=support.enumPrototypes&&isFunction(r);++t<o;)s[t]=t+"";for(var g in r)c&&"prototype"==g||u&&("message"==g||"name"==g)||i&&isIndex(g,o)||"constructor"==g&&(a||!hasOwnProperty.call(r,g))||s.push(g);if(support.nonEnumShadows&&r!==objectProto){var p=r===stringProto?stringTag:r===errorProto?errorTag:objToString.call(r),P=nonEnumProps[p]||nonEnumProps[objectTag];for(p==objectTag&&(e=objectProto),o=shadowProps.length;o--;){g=shadowProps[o];var b=P[g];a&&b||(b?!hasOwnProperty.call(r,g):r[g]===e[g])||s.push(g)}}return s}var arrayEach=require("../internal/arrayEach"),isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isFunction=require("../lang/isFunction"),isIndex=require("../internal/isIndex"),isLength=require("../internal/isLength"),isObject=require("../lang/isObject"),isString=require("../lang/isString"),support=require("../support"),arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",stringTag="[object String]",shadowProps=["constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","toLocaleString","toString","valueOf"],errorProto=Error.prototype,objectProto=Object.prototype,stringProto=String.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString,nonEnumProps={};nonEnumProps[arrayTag]=nonEnumProps[dateTag]=nonEnumProps[numberTag]={constructor:!0,toLocaleString:!0,toString:!0,valueOf:!0},nonEnumProps[boolTag]=nonEnumProps[stringTag]={constructor:!0,toString:!0,valueOf:!0},nonEnumProps[errorTag]=nonEnumProps[funcTag]=nonEnumProps[regexpTag]={constructor:!0,toString:!0},nonEnumProps[objectTag]={constructor:!0},arrayEach(shadowProps,function(r){for(var o in nonEnumProps)if(hasOwnProperty.call(nonEnumProps,o)){var n=nonEnumProps[o];n[r]=hasOwnProperty.call(n,r)}}),module.exports=keysIn;

},{"../internal/arrayEach":17,"../internal/isIndex":72,"../internal/isLength":75,"../lang/isArguments":83,"../lang/isArray":84,"../lang/isFunction":88,"../lang/isObject":92,"../lang/isString":94,"../support":101}],100:[function(require,module,exports){
function pairs(r){r=toObject(r);for(var e=-1,t=keys(r),a=t.length,o=Array(a);++e<a;){var i=t[e];o[e]=[i,r[i]]}return o}var keys=require("./keys"),toObject=require("../internal/toObject");module.exports=pairs;

},{"../internal/toObject":80,"./keys":98}],101:[function(require,module,exports){
var arrayProto=Array.prototype,errorProto=Error.prototype,objectProto=Object.prototype,propertyIsEnumerable=objectProto.propertyIsEnumerable,splice=arrayProto.splice,support={};!function(r){var o=function(){this.x=r},e={0:r,length:r},t=[];o.prototype={valueOf:r,y:r};for(var p in new o)t.push(p);support.enumErrorProps=propertyIsEnumerable.call(errorProto,"message")||propertyIsEnumerable.call(errorProto,"name"),support.enumPrototypes=propertyIsEnumerable.call(o,"prototype"),support.nonEnumShadows=!/valueOf/.test(t),support.ownLast="x"!=t[0],support.spliceObjects=(splice.call(e,0,1),!e[0]),support.unindexedChars="x"[0]+Object("x")[0]!="xx"}(1,0),module.exports=support;

},{}],102:[function(require,module,exports){
function identity(t){return t}module.exports=identity;

},{}],103:[function(require,module,exports){
function property(e){return isKey(e)?baseProperty(e):basePropertyDeep(e)}var baseProperty=require("../internal/baseProperty"),basePropertyDeep=require("../internal/basePropertyDeep"),isKey=require("../internal/isKey");module.exports=property;

},{"../internal/baseProperty":42,"../internal/basePropertyDeep":43,"../internal/isKey":74}],104:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/apiDeclaration.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "basePath", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apiVersion": { "type": "string" },
        "basePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^https?://"
        },
        "resourcePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^/"
        },
        "apis": {
            "type": "array",
            "items": { "$ref": "#/definitions/apiObject" }
        },
        "models": {
            "type": "object",
            "additionalProperties": {
                "$ref": "modelsObject.json#"
            }
        },
        "produces": { "$ref": "#/definitions/mimeTypeArray" },
        "consumes": { "$ref": "#/definitions/mimeTypeArray" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    },
    "additionalProperties": false,
    "definitions": {
        "apiObject": {
            "type": "object",
            "required": [ "path", "operations" ],
            "properties": {
                "path": {
                    "type": "string",
                    "format": "uri-template",
                    "pattern": "^/"
                },
                "description": { "type": "string" },
                "operations": {
                    "type": "array",
                    "items": { "$ref": "operationObject.json#" }
                }
            },
            "additionalProperties": false
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],105:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/authorizationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "additionalProperties": {
        "oneOf": [
            {
                "$ref": "#/definitions/basicAuth"
            },
            {
                "$ref": "#/definitions/apiKey"
            },
            {
                "$ref": "#/definitions/oauth2"
            }
        ]
    },
    "definitions": {
        "basicAuth": {
            "required": [ "type" ],
            "properties": {
                "type": { "enum": [ "basicAuth" ] }
            },
            "additionalProperties": false
        },
        "apiKey": {
            "required": [ "type", "passAs", "keyname" ],
            "properties": {
                "type": { "enum": [ "apiKey" ] },
                "passAs": { "enum": [ "header", "query" ] },
                "keyname": { "type": "string" }
            },
            "additionalProperties": false
        },
        "oauth2": {
            "type": "object",
            "required": [ "type", "grantTypes" ],
            "properties": {
                "type": { "enum": [ "oauth2" ] },
                "scopes": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/oauth2Scope" }
                },
                "grantTypes": { "$ref": "oauth2GrantType.json#" }
            },
            "additionalProperties": false
        },
        "oauth2Scope": {
            "type": "object",
            "required": [ "scope" ],
            "properties": {
                "scope": { "type": "string" },
                "description": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}


},{}],106:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type as described by the specification (version 1.2)",
    "type": "object",
    "oneOf": [
        { "$ref": "#/definitions/refType" },
        { "$ref": "#/definitions/voidType" },
        { "$ref": "#/definitions/primitiveType" },
        { "$ref": "#/definitions/modelType" },
        { "$ref": "#/definitions/arrayType" }
    ],
    "definitions": {
        "refType": {
            "required": [ "$ref" ],
            "properties": {
                "$ref": { "type": "string" }
            },
            "additionalProperties": false
        },
        "voidType": {
            "enum": [ { "type": "void" } ]
        },
        "modelType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "type": "string",
                    "not": {
                        "enum": [ "boolean", "integer", "number", "string", "array" ]
                    }
                }
            },
            "additionalProperties": false
        },
        "primitiveType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "enum": [ "boolean", "integer", "number", "string" ]
                },
                "format": { "type": "string" },
                "defaultValue": {
                    "not": { "type": [ "array", "object", "null" ] }
                },
                "enum": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1,
                    "uniqueItems": true
                },
                "minimum": { "type": "string" },
                "maximum": { "type": "string" }
            },
            "additionalProperties": false,
            "dependencies": {
                "format": {
                    "oneOf": [
                        {
                            "properties": {
                                "type": { "enum": [ "integer" ] },
                                "format": { "enum": [ "int32", "int64" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "number" ] },
                                "format": { "enum": [ "float", "double" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "string" ] },
                                "format": {
                                    "enum": [ "byte", "date", "date-time" ]
                                }
                            }
                        }
                    ]
                },
                "enum": {
                    "properties": {
                        "type": { "enum": [ "string" ] }
                    }
                },
                "minimum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                },
                "maximum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                }
            }
        },
        "arrayType": {
            "required": [ "type", "items" ],
            "properties": {
                "type": { "enum": [ "array" ] },
                "items": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/itemsObject" }
                },
                "uniqueItems": { "type": "boolean" }
            },
            "additionalProperties": false
        },
        "itemsObject": {
            "oneOf": [
                {
                    "$ref": "#/definitions/refType"
                },
                {
                    "allOf": [
                        {
                            "$ref": "#/definitions/primitiveType"
                        },
                        {
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}
},{}],107:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataTypeBase.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type fields (section 4.3.3)",
    "type": "object",
    "oneOf": [
        { "required": [ "type" ] },
        { "required": [ "$ref" ] }
    ],
    "properties": {
        "type": { "type": "string" },
        "$ref": { "type": "string" },
        "format": { "type": "string" },
        "defaultValue": {
            "not": { "type": [ "array", "object", "null" ] }
        },
        "enum": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true,
            "minItems": 1
        },
        "minimum": { "type": "string" },
        "maximum": { "type": "string" },
        "items": { "$ref": "#/definitions/itemsObject" },
        "uniqueItems": { "type": "boolean" }
    },
    "dependencies": {
        "format": {
            "oneOf": [
                {
                    "properties": {
                        "type": { "enum": [ "integer" ] },
                        "format": { "enum": [ "int32", "int64" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "number" ] },
                        "format": { "enum": [ "float", "double" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "string" ] },
                        "format": {
                            "enum": [ "byte", "date", "date-time" ]
                        }
                    }
                }
            ]
        }
    },
    "definitions": {
        "itemsObject": {
            "oneOf": [
                {
                    "type": "object",
                    "required": [ "$ref" ],
                    "properties": {
                        "$ref": { "type": "string" }
                    },
                    "additionalProperties": false
                },
                {
                    "allOf": [
                        { "$ref": "#" },
                        {
                            "required": [ "type" ],
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}

},{}],108:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/infoObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "info object (section 5.1.3)",
    "type": "object",
    "required": [ "title", "description" ],
    "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "termsOfServiceUrl": { "type": "string", "format": "uri" },
        "contact": { "type": "string", "format": "email" },
        "license": { "type": "string" },
        "licenseUrl": { "type": "string", "format": "uri" }
    },
    "additionalProperties": false
}
},{}],109:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/modelsObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "id", "properties" ],
    "properties": {
        "id": { "type": "string" },
        "description": { "type": "string" },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#/definitions/propertyObject" }
        },
        "subTypes": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true
        },
        "discriminator": { "type": "string" }
    },
    "dependencies": {
        "subTypes": [ "discriminator" ]
    },
    "definitions": {
        "propertyObject": {
            "allOf": [
                {
                    "not": { "$ref": "#" }
                },
                {
                    "$ref": "dataTypeBase.json#"
                }
            ]
        }
    }
}


},{}],110:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/oauth2GrantType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "minProperties": 1,
    "properties": {
        "implicit": { "$ref": "#/definitions/implicit" },
        "authorization_code": { "$ref": "#/definitions/authorizationCode" }
    },
    "definitions": {
        "implicit": {
            "type": "object",
            "required": [ "loginEndpoint" ],
            "properties": {
                "loginEndpoint": { "$ref": "#/definitions/loginEndpoint" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "authorizationCode": {
            "type": "object",
            "required": [ "tokenEndpoint", "tokenRequestEndpoint" ],
            "properties": {
                "tokenEndpoint": { "$ref": "#/definitions/tokenEndpoint" },
                "tokenRequestEndpoint": { "$ref": "#/definitions/tokenRequestEndpoint" }
            },
            "additionalProperties": false
        },
        "loginEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" }
            },
            "additionalProperties": false
        },
        "tokenEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "tokenRequestEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "clientIdName": { "type": "string" },
                "clientSecretName": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}
},{}],111:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/operationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "method", "nickname", "parameters" ],
            "properties": {
                "method": { "enum": [ "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] },
                "summary": { "type": "string", "maxLength": 120 },
                "notes": { "type": "string" },
                "nickname": {
                    "type": "string",
                    "pattern": "^[a-zA-Z0-9_]+$"
                },
                "authorizations": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {
                            "$ref": "authorizationObject.json#/definitions/oauth2Scope"
                        }
                    }
                },
                "parameters": {
                    "type": "array",
                    "items": { "$ref": "parameterObject.json#" }
                },
                "responseMessages": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/responseMessageObject"}
                },
                "produces": { "$ref": "#/definitions/mimeTypeArray" },
                "consumes": { "$ref": "#/definitions/mimeTypeArray" },
                "deprecated": { "enum": [ "true", "false" ] }
            }
        }
    ],
    "definitions": {
        "responseMessageObject": {
            "type": "object",
            "required": [ "code", "message" ],
            "properties": {
                "code": { "$ref": "#/definitions/rfc2616section10" },
                "message": { "type": "string" },
                "responseModel": { "type": "string" }
            }
        },
        "rfc2616section10": {
            "type": "integer",
            "minimum": 100,
            "maximum": 600,
            "exclusiveMaximum": true
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],112:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/parameterObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "paramType", "name" ],
            "properties": {
                "paramType": {
                    "enum": [ "path", "query", "body", "header", "form" ]
                },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "required": { "type": "boolean" },
                "allowMultiple": { "type": "boolean" }
            }
        },
        {
            "description": "type File requires special paramType and consumes",
            "oneOf": [
                {
                    "properties": {
                        "type": { "not": { "enum": [ "File" ] } }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "File" ] },
                        "paramType": { "enum": [ "form" ] },
                        "consumes": { "enum": [ "multipart/form-data" ] }
                    }
                }
            ]
        }
    ]
}

},{}],113:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceListing.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apis": {
            "type": "array",
            "items": { "$ref": "resourceObject.json#" }
        },
        "apiVersion": { "type": "string" },
        "info": { "$ref": "infoObject.json#" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    }
}

},{}],114:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "path" ],
    "properties": {
        "path": { "type": "string", "format": "uri" },
        "description": { "type": "string" }
    },
    "additionalProperties": false
}
},{}],115:[function(require,module,exports){
module.exports={
  "title": "A JSON Schema for Swagger 2.0 API.",
  "id": "http://swagger.io/v2/schema.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": [
    "swagger",
    "info",
    "paths"
  ],
  "additionalProperties": false,
  "patternProperties": {
    "^x-": {
      "$ref": "#/definitions/vendorExtension"
    }
  },
  "properties": {
    "swagger": {
      "type": "string",
      "enum": [
        "2.0"
      ],
      "description": "The Swagger version of this document."
    },
    "info": {
      "$ref": "#/definitions/info"
    },
    "host": {
      "type": "string",
      "format": "uri",
      "pattern": "^[^{}/ :\\\\]+(?::\\d+)?$",
      "description": "The fully qualified URI to the host of the API."
    },
    "basePath": {
      "type": "string",
      "pattern": "^/",
      "description": "The base path to the API. Example: '/api'."
    },
    "schemes": {
      "$ref": "#/definitions/schemesList"
    },
    "consumes": {
      "description": "A list of MIME types accepted by the API.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "produces": {
      "description": "A list of MIME types the API can produce.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "paths": {
      "$ref": "#/definitions/paths"
    },
    "definitions": {
      "$ref": "#/definitions/definitions"
    },
    "parameters": {
      "$ref": "#/definitions/parameterDefinitions"
    },
    "responses": {
      "$ref": "#/definitions/responseDefinitions"
    },
    "security": {
      "$ref": "#/definitions/security"
    },
    "securityDefinitions": {
      "$ref": "#/definitions/securityDefinitions"
    },
    "tags": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/tag"
      },
      "uniqueItems": true
    },
    "externalDocs": {
      "$ref": "#/definitions/externalDocs"
    }
  },
  "definitions": {
    "info": {
      "type": "object",
      "description": "General information about the API.",
      "required": [
        "version",
        "title"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "title": {
          "type": "string",
          "description": "A unique and precise title of the API."
        },
        "version": {
          "type": "string",
          "description": "A semantic version number of the API."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the API. Should be different from the title.  Github-flavored markdown is allowed."
        },
        "termsOfService": {
          "type": "string",
          "description": "The terms of service for the API."
        },
        "contact": {
          "$ref": "#/definitions/contact"
        },
        "license": {
          "$ref": "#/definitions/license"
        }
      }
    },
    "contact": {
      "type": "object",
      "description": "Contact information for the owners of the API.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The identifying name of the contact person/organization."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the contact information.",
          "format": "uri"
        },
        "email": {
          "type": "string",
          "description": "The email address of the contact person/organization.",
          "format": "email"
        }
      }
    },
    "license": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the license type. It's encouraged to use an OSI compatible license."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the license.",
          "format": "uri"
        }
      }
    },
    "paths": {
      "type": "object",
      "description": "Relative paths to the individual endpoints. They must be relative to the 'basePath'.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        },
        "^/": {
          "$ref": "#/definitions/pathItem"
        }
      },
      "additionalProperties": false
    },
    "definitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/schema"
      },
      "description": "One or more JSON objects describing the schemas being consumed and produced by the API."
    },
    "parameterDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/parameter"
      },
      "description": "One or more JSON representations for parameters"
    },
    "responseDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/response"
      },
      "description": "One or more JSON representations for parameters"
    },
    "externalDocs": {
      "type": "object",
      "additionalProperties": false,
      "description": "information about external documentation",
      "required": [
        "url"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      }
    },
    "examples": {
      "type": "object",
      "patternProperties": {
        "^[a-z0-9-]+/[a-z0-9\\-+]+$": {}
      },
      "additionalProperties": false
    },
    "mimeType": {
      "type": "string",
      "description": "The MIME type of the HTTP message."
    },
    "operation": {
      "type": "object",
      "required": [
        "responses"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "summary": {
          "type": "string",
          "description": "A brief summary of the operation."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the operation, github-flavored markdown is allowed."
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "operationId": {
          "type": "string",
          "description": "A friendly name of the operation"
        },
        "produces": {
          "description": "A list of MIME types the API can produce.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "consumes": {
          "description": "A list of MIME types the API can consume.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        },
        "responses": {
          "$ref": "#/definitions/responses"
        },
        "schemes": {
          "$ref": "#/definitions/schemesList"
        },
        "deprecated": {
          "type": "boolean",
          "default": false
        },
        "security": {
          "$ref": "#/definitions/security"
        }
      }
    },
    "pathItem": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "get": {
          "$ref": "#/definitions/operation"
        },
        "put": {
          "$ref": "#/definitions/operation"
        },
        "post": {
          "$ref": "#/definitions/operation"
        },
        "delete": {
          "$ref": "#/definitions/operation"
        },
        "options": {
          "$ref": "#/definitions/operation"
        },
        "head": {
          "$ref": "#/definitions/operation"
        },
        "patch": {
          "$ref": "#/definitions/operation"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        }
      }
    },
    "responses": {
      "type": "object",
      "description": "Response objects names can either be any valid HTTP status code or 'default'.",
      "minProperties": 1,
      "additionalProperties": false,
      "patternProperties": {
        "^([0-9]{3})$|^(default)$": {
          "$ref": "#/definitions/responseValue"
        },
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "not": {
        "type": "object",
        "additionalProperties": false,
        "patternProperties": {
          "^x-": {
            "$ref": "#/definitions/vendorExtension"
          }
        }
      }
    },
    "responseValue": {
      "oneOf": [
        {
          "$ref": "#/definitions/response"
        },
        {
          "$ref": "#/definitions/jsonReference"
        }
      ]
    },
    "response": {
      "type": "object",
      "required": [
        "description"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "schema": {
          "$ref": "#/definitions/schema"
        },
        "headers": {
          "$ref": "#/definitions/headers"
        },
        "examples": {
          "$ref": "#/definitions/examples"
        }
      },
      "additionalProperties": false
    },
    "headers": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/header"
      }
    },
    "header": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        },
        "description": {
          "type": "string"
        }
      }
    },
    "vendorExtension": {
      "description": "Any property starting with x- is valid.",
      "additionalProperties": true,
      "additionalItems": true
    },
    "bodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "schema"
      ],
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "body"
          ]
        },
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "schema": {
          "$ref": "#/definitions/schema"
        }
      },
      "additionalProperties": false
    },
    "headerParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "header"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "queryParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "query"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "formDataParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "formData"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array",
            "file"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "pathParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "enum": [
            true
          ],
          "description": "Determines whether or not this parameter is required or optional."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "path"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "nonBodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "type"
      ],
      "oneOf": [
        {
          "$ref": "#/definitions/headerParameterSubSchema"
        },
        {
          "$ref": "#/definitions/formDataParameterSubSchema"
        },
        {
          "$ref": "#/definitions/queryParameterSubSchema"
        },
        {
          "$ref": "#/definitions/pathParameterSubSchema"
        }
      ]
    },
    "parameter": {
      "oneOf": [
        {
          "$ref": "#/definitions/bodyParameter"
        },
        {
          "$ref": "#/definitions/nonBodyParameter"
        }
      ]
    },
    "schema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "format": {
          "type": "string"
        },
        "title": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
        },
        "description": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
        },
        "default": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
        },
        "multipleOf": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
        },
        "maximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "pattern": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
        },
        "maxItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "uniqueItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
        },
        "maxProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "enum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
        },
        "additionalProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/additionalProperties"
        },
        "type": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/type"
        },
        "items": {
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/schema"
              }
            }
          ],
          "default": {}
        },
        "allOf": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/schema"
          }
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/schema"
          },
          "default": {}
        },
        "discriminator": {
          "type": "string"
        },
        "readOnly": {
          "type": "boolean",
          "default": false
        },
        "xml": {
          "$ref": "#/definitions/xml"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "example": {}
      },
      "additionalProperties": false
    },
    "primitivesItems": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "security": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/securityRequirement"
      },
      "uniqueItems": true
    },
    "securityRequirement": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "uniqueItems": true
      }
    },
    "xml": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string"
        },
        "namespace": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "attribute": {
          "type": "boolean",
          "default": false
        },
        "wrapped": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "tag": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "securityDefinitions": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "$ref": "#/definitions/basicAuthenticationSecurity"
          },
          {
            "$ref": "#/definitions/apiKeySecurity"
          },
          {
            "$ref": "#/definitions/oauth2ImplicitSecurity"
          },
          {
            "$ref": "#/definitions/oauth2PasswordSecurity"
          },
          {
            "$ref": "#/definitions/oauth2ApplicationSecurity"
          },
          {
            "$ref": "#/definitions/oauth2AccessCodeSecurity"
          }
        ]
      }
    },
    "basicAuthenticationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "basic"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "apiKeySecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "name",
        "in"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "apiKey"
          ]
        },
        "name": {
          "type": "string"
        },
        "in": {
          "type": "string",
          "enum": [
            "header",
            "query"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ImplicitSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "implicit"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2PasswordSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "password"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ApplicationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "application"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2AccessCodeSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "accessCode"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2Scopes": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "mediaTypeList": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/mimeType"
      },
      "uniqueItems": true
    },
    "parametersList": {
      "type": "array",
      "description": "The parameters needed to send a valid API call.",
      "additionalItems": false,
      "items": {
        "oneOf": [
          {
            "$ref": "#/definitions/parameter"
          },
          {
            "$ref": "#/definitions/jsonReference"
          }
        ]
      },
      "uniqueItems": true
    },
    "schemesList": {
      "type": "array",
      "description": "The transfer protocol of the API.",
      "items": {
        "type": "string",
        "enum": [
          "http",
          "https",
          "ws",
          "wss"
        ]
      },
      "uniqueItems": true
    },
    "collectionFormat": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes"
      ],
      "default": "csv"
    },
    "collectionFormatWithMulti": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes",
        "multi"
      ],
      "default": "csv"
    },
    "title": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
    },
    "description": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
    },
    "default": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
    },
    "multipleOf": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
    },
    "maximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
    },
    "exclusiveMaximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
    },
    "minimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
    },
    "exclusiveMinimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
    },
    "maxLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "pattern": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
    },
    "maxItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "uniqueItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
    },
    "enum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
    },
    "jsonReference": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "$ref": {
          "type": "string"
        }
      }
    }
  }
}
},{}],116:[function(require,module,exports){
module.exports={
    "id": "http://json-schema.org/draft-04/schema#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Core schema meta-schema",
    "definitions": {
        "schemaArray": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#" }
        },
        "positiveInteger": {
            "type": "integer",
            "minimum": 0
        },
        "positiveIntegerDefault0": {
            "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
        },
        "simpleTypes": {
            "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
        },
        "stringArray": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "uniqueItems": true
        }
    },
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "format": "uri"
        },
        "$schema": {
            "type": "string",
            "format": "uri"
        },
        "title": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "default": {},
        "multipleOf": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
        },
        "maximum": {
            "type": "number"
        },
        "exclusiveMaximum": {
            "type": "boolean",
            "default": false
        },
        "minimum": {
            "type": "number"
        },
        "exclusiveMinimum": {
            "type": "boolean",
            "default": false
        },
        "maxLength": { "$ref": "#/definitions/positiveInteger" },
        "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "pattern": {
            "type": "string",
            "format": "regex"
        },
        "additionalItems": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "items": {
            "anyOf": [
                { "$ref": "#" },
                { "$ref": "#/definitions/schemaArray" }
            ],
            "default": {}
        },
        "maxItems": { "$ref": "#/definitions/positiveInteger" },
        "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "uniqueItems": {
            "type": "boolean",
            "default": false
        },
        "maxProperties": { "$ref": "#/definitions/positiveInteger" },
        "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "required": { "$ref": "#/definitions/stringArray" },
        "additionalProperties": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "definitions": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "patternProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "dependencies": {
            "type": "object",
            "additionalProperties": {
                "anyOf": [
                    { "$ref": "#" },
                    { "$ref": "#/definitions/stringArray" }
                ]
            }
        },
        "enum": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true
        },
        "type": {
            "anyOf": [
                { "$ref": "#/definitions/simpleTypes" },
                {
                    "type": "array",
                    "items": { "$ref": "#/definitions/simpleTypes" },
                    "minItems": 1,
                    "uniqueItems": true
                }
            ]
        },
        "allOf": { "$ref": "#/definitions/schemaArray" },
        "anyOf": { "$ref": "#/definitions/schemaArray" },
        "oneOf": { "$ref": "#/definitions/schemaArray" },
        "not": { "$ref": "#" }
    },
    "dependencies": {
        "exclusiveMaximum": [ "maximum" ],
        "exclusiveMinimum": [ "minimum" ]
    },
    "default": {}
}

},{}]},{},[2])(2)
});