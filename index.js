var difflet = require('difflet');
var deepEqual = require('deep-equal');
var expect = require("expect.js");
var util = require('util');
var sift = require('sift');
var urlgrey = require('urlgrey');
var request = require('request');
var Reaper = require('reaper');

var isString = function(str){
  return toString.call(str) == '[object String]';
};

// checks a response holistically, rather than in parts,
// which results in better error output.
var Verity = function(uri, method){
  if (!(this instanceof Verity)) {
    return new Verity(uri, method);
  }
  this.uri = urlgrey(uri || 'http://localhost:80');
  this.method = method || 'GET';
  this.body = '';
  this.client = request.defaults({timeout:3000});
  this.headers = {};
  this.expectedBody = null;
  this.expectedStatus = 200;
  this.expectedHeaders = {};
  this._expectedBodyTesters = [];
  this._shouldThrow = true;
  this.befores = [];
  this._expected = null;
  this.response = {};
  this.jsonModeOn = false;
  this.message = '';
  this.clearCookies();
  this.log = function(){
    var addition = '';
    for (var k in arguments){
      if (isString(arguments[k])){
        addition += arguments[k];
      } else {
        addition += util.inspect(arguments[k]) + " ";
      }
    }
    addition += "\n";
    this.message += addition;
    //process.stdout.write(addition);
  };
  this.onerror = function(err, method, uri, headers, body){
    this.log("");
    this.log("unexpected error: ", (err.message || err));
    this.log(util.inspect(err));
    this.log("method: ", method);
    this.log("uri: ", uri);
    this.log("body: ", body);
    this.log("headers: ", headers);
    this.log("");
    throw "unexpected error: " + JSON.stringify((err.message || err));
  };
};

/**
 * filter body can be a sift object, or a function
 */



Verity.prototype.checkBody = function (expectedCheckBody) {
  var tester = sift(expectedCheckBody).test;
  tester.expectedBody = expectedCheckBody;
  this._expectedBodyTesters.push(tester);
  return this;
};

/**
 */

Verity.prototype.expectBody = function (expectedBody) {
  this.expectedBody = expectedBody;

  var tester = function (body) {
    return deepEqual(body, expectedBody);
  };

  tester.expectedBody = expectedBody;

  this._expectedBodyTesters.push(tester);
  return this;
};

/**
 */

Verity.prototype.expectStatus = function (code) {
  this.expectedStatus = code;
  return this;
};

Verity.prototype.setCookiesFromResponse = function(res){
  if (!res){
    res = this.response.object;
  }
  var that = this;
  res.headers['set-cookie'].forEach(function(cookie){
    cookie = cookieStringToObject(cookie);
    if (cookie.value === ''){
      delete that.cookies[cookie.name];
    } else {
      that.cookies[cookie.name] = cookie;
    }
  });
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

Verity.prototype.onError = function(cb){
  this.onerror = cb;
};

Verity.prototype.clearCookies = function(){
  this.cookies = {};
};

Verity.prototype.expectHeader = function(name, value){
  this.expectedHeaders[name] = value;
};
Verity.prototype.jsonMode = function(){
  this.expectHeader('content-type', 'application/json');
  this.jsonModeOn = true;
  return this;
};
Verity.prototype.before = function(cb){
  this.befores.push(cb);
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
  options.method = this.method.toLowerCase();
  options.url = this.uri.toString();
  if (!!this.body){
    if (this.jsonModeOn){
      options.headers['content-type'] = 'application/json';
      if (!isString(this.body)){
        options.body = JSON.stringify(this.body);
      }
    } else {
      options.body = this.body;
    }
  }
  var that = this;
  options.jar = this.jar;
  if (this.creds){
    this.authStrategy(this.creds, function(){
      makeRequest(that, options, cb);
    });
  } else {
    makeRequest(that, options, cb);
  }
};

Verity.prototype.makeRequest = function(cb){
  var options = { headers : this.headers};
  options.method = this.method.toLowerCase();
  options.url = this.uri.toString();
  if (!!this.body){
    if (this.jsonModeOn){
      options.headers['content-type'] = 'application/json';
      if (!isString(this.body)){
        options.body = JSON.stringify(this.body);
      }
    } else {
      options.body = this.body;
    }
  }
  var that = this;
  options.jar = this.jar;
  if (this.creds){
    this.authStrategy(this.creds, function(){
      makeRequest(that, options, cb);
    });
  } else {
    makeRequest(that, options, cb);
  }
};


var makeRequest = function(that, options, cb){
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
      return that.onerror(err,
                          options.method,
                          options.url,
                          options.headers,
                          options.body);
    }
    var errObject = {
      status : {},
      headers : {},
      body : {}
    };
    that.response.headers = response.headers;
    that.response.body = body;
    that.response.status = response.statusCode;
    that.response.statusCode = response.statusCode;
    that.response.object = response;
    if (that.jsonModeOn){
      try {
        body = JSON.parse(body);
      } catch(ex){
        // do nothing if it doesn't parse.
        // it will stay as a string
      }
    }
    var failed = false;
    that.log("STATUS: ");
    errObject.status.actual = response.statusCode;
    errObject.status.expected = that.expectedStatus;
    try {
      that.log('actual: ', response.statusCode);
      that.log('expected: ', that.expectedStatus);
      expect(response.statusCode).to.equal(that.expectedStatus);
    } catch(ex) {
      that.log("Failure: ");
      that.log(ex);
      failed = true;
    }
    that.log('');
    that.log('RESPONSE HEADERS');
    that.log("actual: ", response.headers);
    for(var k in that.expectedHeaders){
      var v = that.expectedHeaders[k];
      if (k == 'content-type'){
        var reaper = new Reaper();
        reaper.register(v);
        expect(reaper.isAcceptable('application/json')).to.equal(true);
      } else {
        expect(response.headers[k]).to.equal(v);
      }
    }
    errObject.body.actual = body;
    errObject.body.expected = that.expectedBody;
    errObject.headers.actual = response.headers;
    errObject.headers.expected = that.expectedHeaders;
    that.log("BODY: ");

    // newer body tester

    /**
     verify.
      checkBody(siftObj).
      expectBody(exactOb)
     */

    // need to check if the body is an object
    // because  body parsing could blow up here.
    if (typeof body === "object") {

      for (var i = that._expectedBodyTesters.length; i--;) {
        var bodyTester = that._expectedBodyTesters[i];
        if (!bodyTester(body)) {
          that.log("Failure: ");
          that.logObjectDiff(body, bodyTester.expectedBody);
          failed = true;
        }
      }
    }

    // DEPRECATED
    if (that.expectedBody !== null){
      if (!deepEqual(body, that.expectedBody)){
        that.log("Failure: ");
        that.logObjectDiff(body, that.expectedBody);
        errObject.body.diff = (difflet({indent:2}).
                                compare(errObject.body.actual, errObject.body.expected));
        failed = true;
      }
    }

    if (failed){
      if (that._shouldThrow){
        throw that.message;
      } else {
        return cb(errObject);
      }
    }
    return cb();
  });

};

Verity.prototype.shouldThrow = function (should){
  this._shouldThrow = should;
  return this;
};

Verity.prototype.logObjectDiff = function (actual, expected){
    this.log(difflet({indent:2}).compare(actual, expected));
    this.log("\n\nactual");
    this.log(JSON.stringify(actual, null, 2));
    this.log("\n\nexpected");
    this.log(JSON.stringify(expected, null, 2));
    this.log("\n\n");
};

module.exports = Verity;

