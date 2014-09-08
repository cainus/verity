#verity

###integration testing for http requests

###features:
* content-type matching
* application/json response testing with colorized diffs
* responses are verified holistically, for better reporting
* supports cookies
* supports login strategies
* easy url manipulation

###basic usage:

```javascript
  var v = verity("http://localhost:8080/path/");
  v.jsonMode();
  v.method("POST");
  v.body({"some" : "json"});
  v.expectStatus(200);
  v.expectBody({"success" : true});
  v.test();
```

or using the chained interface:

```javascript
  var v = verity("http://localhost:8080/path/")
  .jsonMode()
  .method("POST")
  .body({"some" : "json"})
  .expectStatus(200)
  .expectBody({"success" : true})
  .test();
```


###api:

####jsonMode()
Call `jsonMode()` to allow json request and response bodies to be automatically serialized and deserialized into javascript objects.

####body(String/Object)
Call `body()` to set the contents of the request body.  This should be a string unless `jsonMode()` has been called.

####method(String)
Call `method()` with an HTTP method to set the HTTP request method.

####header(name, value)
Call `header()` with a header name and value to set a single http
request header.

####setCookieFromString(String)
Call `setCookieFromString()' to pass a cookie string to set the cookie values of the request.

####expectStatus(Number)
Call `expectStatus()` to declare the HTTP status code that you expect the reponse to have.

####expectHeader(name, value)
Call `expectHeader()` to declare a name/value to expect in the response headers.

####expectCookie(name, value)
Call `expectCookie()` to declare a name/value to expect in the response cookies.

####expectBody(String/Object)
Call `expectBody()` to declare what bopdy to expect in the response.  This should be a string unless `jsonMode()` has been called.

TODO document callback-style usage

####test(cb)
Call `test()` to actually execute the specified request, and test your expectations.  `test()` takes a callback that expects `error` and `result` arguments.  The `error` parameter is truthy if the expectations were not met.  The `result` parameter will contain an object detailing the actual and expected results.

TODO document the `result` object

####authStrategy
TODO document

####login
TODO document

####assertObjectEquals(obj1, obj2)
`assertObjectEquals()` is a static method on the verity object that can be used in general to assert that two objects are deeply-equal, and to throw an assertion error if they're not, along with logging the diffs.

TODO document use in mocha.  document use in other test frameworks.

TODO document changing the url
