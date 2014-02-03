var deepEqual = require('deep-equal');
var expect = require("expect.js");
var util = require('util');
var urlgrey = require('urlgrey');
var request = require('request');
var superagent = require('superagent');
var Reaper = require('reaper');
var difflet = require('difflet');
var diff = difflet({indent:2}).compare;
var assert = require('assert');

var isString = function(str){
  return toString.call(str) == '[object String]';
};

var isFunction = function(functionToCheck) {
 var getType = {};
 return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
};

var client = request.defaults({
  timeout:3000,
  jar: request.jar()
});

// checks a response holistically, rather than in parts,
// which results in better error output.
var Verity = function(uri, _method){
  if (!(this instanceof Verity)) {
    return new Verity(uri, _method);
  }
  this.uri = urlgrey(uri || 'http://localhost:80');
  this._method = _method || 'GET';
  this._body = '';
  this.bodyChecks = [];
  this.client = client;
  this.client.jar();
  this.headers = {};
  this.shouldLog = false;
  this.expectedBody = null;
  this._expectedStatus = 200;
  this._expectedHeaders = {};
  this._expectedBodyTesters = [];
  this._expected = null;
  this.response = {};
  this.jsonModeOn = false;
  this.message = '';
  this.clearCookies();
};


Verity.prototype.body = function(body){
  this._body = body;
  return this;
};

Verity.prototype.method = function(method){
  this._method = method;
  return this;
};

Verity.prototype.expectStatus = function (code) {
  this._expectedStatus = code;
  return this;
};

Verity.prototype.setCookiesFromResponse = function(res){
  if (!res){
    res = this.response.object;
  }
  var that = this;
  if (res.headers['set-cookie']){
    res.headers['set-cookie'].forEach(function(cookie){
      cookie = cookieStringToObject(cookie);
      if (cookie.value === ''){
        delete that.cookies[cookie.name];
      } else {
        that.cookies[cookie.name] = cookie;
      }
    });
  }
};

var cookieObjectToString = function(obj){
  var pairs = [obj.name + '=' + obj.value];
  for(var k in obj){
    if (k !== 'name' && k !== 'value'){
      pairs.push(k + '=' + obj[k]);
    }
  }
  var str = pairs.join('; ');
  return str;
};

var cookieStringToObject = function(str){
  var obj = {};
  var pairs = str.toString().split(";");
  pairs.forEach(function(pair){
    var pieces = pair.trim().split('=');
    var name = [
      "Domain", "Path", "Expires"
    ];
    if (name.indexOf(pieces[0]) === -1){
      obj.name = pieces[0];
      obj.value = pieces[1];
    } else {
      obj[pieces[0]] = pieces[1];
    }
  });
  return obj;
};

Verity.prototype.clearCookies = function(){
  this.cookies = {};
  return this;
};

Verity.prototype.expectHeader = function(name, value){
  this._expectedHeaders[name] = value;
  return this;
};
Verity.prototype.jsonMode = function(){
  this.expectHeader('content-type', 'application/json');
  this.jsonModeOn = true;
  return this;
};
Verity.prototype.authStrategy = function(creds, cb){
  // replace this with a function that logs the user in
  return cb(null);
};
Verity.prototype.login = function(creds){
  this.creds = creds;
  return this;
};
Verity.prototype.test = function(cb){
  this.message = '';
  var options = { headers : this.headers};
  options.method = this._method.toLowerCase();
  options.url = this.uri.toString();
  if (!!this._body){
    if (this.jsonModeOn){
      options.headers['content-type'] = 'application/json';
      if (!isString(this._body)){
        options.body = JSON.stringify(this._body);
      }
    } else {
      options.body = this._body;
    }
  }
  var that = this;
  if (this.creds){
    this.authStrategy(this.creds, function(){
      makeRequest(that, options, cb);
    });
  } else {
    makeRequest(that, options, cb);
  }
};

// TODO make sure this gets called
var postRequestReset = function(v){
  v.bodyChecks = [];
  v._body = '';
  v._headers = {};
};

var makeRequest = function(that, options, cb){
  // options will have : headers, method, url, body
  options.jar = that.jar;

  that.creds = null;  // forget that we know how to log in
  var j = request.jar();
  for (var k in that.cookies){
    var obj = that.cookies[k];
    var cookiestr = cookieObjectToString(obj);
    var cookie = that.client.cookie(cookiestr);
    j.add(cookie);
  }
  options.jar = j;
  that.response = {};
  that.client(options, function(err, response, body){
    if (err) {
      return cb(err);
    }
    that.response = response;
    that.setCookiesFromResponse(response);
    var result = {
      status : {},
      headers : {},
      body : {}
    };
    if (that.jsonModeOn){
      try {
        body = JSON.parse(body);
      } catch(ex){
        // do nothing if it doesn't parse.
        // it will stay as a string
      }
    }
    
    var failed = false;


    // statusCode stuff
    result.status.actual = response.statusCode;
    result.status.expected = that._expectedStatus;
    if (response.statusCode != that._expectedStatus){
      failed = true;
    }

    // header stuff
    for(var k in that._expectedHeaders){
      var v = that._expectedHeaders[k];
      if (k == 'content-type'){
        var reaper = new Reaper();
        reaper.register(v);
        expect(reaper.isAcceptable('application/json')).to.equal(true);
      } else {
        expect(response.headers[k]).to.equal(v);
      }
    }
    result.headers.actual = response.headers;
    result.headers.expected = that._expectedHeaders;

    // body stuff
    result.body.actual = body;
    result.body.errors = [];
    result.body.errors = getBodyErrors(that, body);
    if (result.body.errors.length > 0){
      failed = true;
    }

    if (that.shouldLog){
      prettyDiff(result);
    }
    if (failed){
      return cb(new Error('Expectations failed'), result);
    }
    postRequestReset(that);
    return cb(null, result);
  });

};

var getBodyErrors = function(v, body){
  var errors = [];
  var testBody = body;
  v.bodyChecks.forEach(function(check){
    try {
      check.fnTest(testBody);
    } catch (ex){
      errors.push(ex);
    }
  });
  return errors;
};

Verity.prototype.checkBody = function(description, fnTest){
  // each call adds an assertion to the body assertions
  // fnTest should throw an assert error
  // optionalJsonPath is optional
  if (!fnTest){
    fnTest = description;
    description = '';
  }
  if (!isFunction(fnTest)){
    var expected = fnTest;
    fnTest = function(body){
      assertObjectEquals(body, expected);
    };
  }
  this.bodyChecks.push({ message : description,
                         fnTest : fnTest });
  return this;
};

Verity.prototype.expectBody = function(body){
  return this.checkBody(body);
};

// format the diff better
var prettyDiff = function (result){
  if (result.body.errors && result.body.errors.length > 0){
    console.log("\nBODY ERRORS: ");
    result.body.errors.forEach(function(error){
      console.log(prettyJson({actual : error.actual, expected : error.expected}));
      console.log(error.colorDiff);
    });
  }
  console.log('HEADERS: \n', prettyJson(result.headers));
  console.log('STATUS: \n', prettyJson(result.status));
};

Verity.prototype.log = function(shouldLog){
  if (shouldLog !== false){
    this.shouldLog = true;
  } else {
    this.shouldLog = false;
  }
  return this;
};

// TODO fix the eventemitter issue
// TODO possible libs :
//  - create a jsonschema from code
//
// goals : 
// - be good at reporting the whole diff at once (not just the first one found)
// - make repeated requests easy (with cookies)
// - 
// test:
// chaining with cookies

var assertObjectEquals = function (actual, expected){
  if (!deepEqual(actual, expected)){
    var err = new Error("ObjectEqualityAssertionError");
    err.actual = actual;
    err.expected = expected;
    err.colorDiff = difflet.compare(actual, expected);
    throw err;
  }
};
  
var prettyJson = function(obj){
  return JSON.stringify(obj, null, 2);
};

Verity.assertObjectEquals = assertObjectEquals;
Verity.prototype.assertObjectEquals = assertObjectEquals;

module.exports = Verity;
