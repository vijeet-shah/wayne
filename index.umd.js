(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.wayne = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HTTPResponse = void 0;
exports.RouteParser = RouteParser;
exports.Wayne = void 0;

/*
 * Wayne - Server Worker Routing library
 *
 * Copyright (c) 2022 Jakub T. Jankiewicz <https://jcubic.pl/me>
 * Released under MIT license
 */
const root_url = location.pathname.replace(/\/[^\/]+$/, '');
const root_url_re = new RegExp('^' + escape_re(root_url));

function normalize_url(url) {
  return url.replace(root_url_re, '');
}

function escape_re(str) {
  if (typeof str == 'string') {
    var special = /([\^\$\[\]\(\)\{\}\+\*\.\|])/g;
    return str.replace(special, '\\$1');
  }
}

class HTTPResponse {
  constructor(resolve) {
    this._resolve = resolve;
  }

  html(data, init) {
    this.send(data, {
      type: 'text/html',
      ...init
    });
  }

  text(data, init) {
    this.send(data, init);
  }

  json(data, init) {
    this.send(JSON.stringify(data), {
      type: 'application/json',
      ...init
    });
  }

  send(data, {
    type = 'text/plain',
    ...init
  } = {}) {
    const blob = new Blob([data], {
      type
    });

    this._resolve(new Response(blob, init));
  }

  redirect(code, url) {
    if (url === undefined) {
      url = code;
      code = 302;
    }

    this._resolve(Response.redirect(root_url + url, code));
  }

} // code extracted from https://github.com/jcubic/route.js
// Copyright (C) 2014-2017 Jakub T. Jankiewicz <https://jcubic.pl/me>


exports.HTTPResponse = HTTPResponse;

function RouteParser() {
  const name_re = '[a-zA-Z_][a-zA-Z_0-9]*';
  const self = this;
  const open_tag = '{';
  const close_tag = '}';

  self.route_parser = function (open, close) {
    const routes = {};
    const tag_re = new RegExp('(' + escape_re(open) + name_re + escape_re(close) + ')', 'g');
    const clear_re = new RegExp(escape_re(open) + '(' + name_re + ')' + escape_re(close), 'g');
    return function (str) {
      const result = [];
      str = str.split(tag_re).map(function (chunk) {
        if (chunk.match(tag_re)) {
          result.push(chunk.replace(clear_re, '$1'));
          return '([^\\/]+)';
        } else {
          return chunk;
        }
      }).join('');
      return {
        re: str,
        names: result
      };
    };
  };

  const parse = self.route_parser(open_tag, close_tag);
  self.parse = parse;

  self.pick = function (routes, url) {
    let input;
    let keys;

    if (routes instanceof Array) {
      input = {};
      keys = routes;
      routes.map(function (route) {
        input[route] = route;
      });
    } else {
      keys = Object.keys(routes);
      input = routes;
    }

    const results = [];

    for (let i = keys.length; i--;) {
      const pattern = keys[i];
      const parts = parse(pattern);
      const m = url.match(new RegExp('^' + parts.re + '$'));

      if (m) {
        const matched = m.slice(1);
        const data = {};

        if (matched.length) {
          parts.names.forEach((name, i) => {
            data[name] = matched[i];
          });
        }

        results.push({
          pattern,
          data
        });
      }
    }

    return results;
  };
}

function error500(error) {
  var output = ['<!DOCTYPE html>', '<html>', '<body>', '<h1>500 Server Error</h1>', '<p>Service worker give 500 error</p>', `<p>${error.message || error}</p>`, `<pre>${error.stack || ''}</pre>`, '</body>', '</html>'];
  return [output.join('\n'), {
    status: 500,
    statusText: '500 Server Error'
  }];
}

function error404(path) {
  var output = ['<!DOCTYPE html>', '<html>', '<body>', '<h1>404 File Not Found</h1>', `<p>File ${path} not found`, '</body>', '</html>'];
  return [output.join('\n'), {
    status: 404,
    statusText: '404 Page Not Found'
  }];
}

class Wayne {
  constructor() {
    this._routes = {};
    this._parser = new RouteParser();
    self.addEventListener('fetch', event => {
      event.respondWith(new Promise((resolve, reject) => {
        try {
          const req = event.request;
          const method = req.method;
          const url = new URL(req.url);
          const path = normalize_url(url.pathname);
          const routes = this._routes[method];

          if (routes) {
            const match = this._parser.pick(routes, path);

            if (match.length) {
              const [first_match] = match;
              const fn = routes[first_match.pattern];
              req.params = first_match.data;
              const res = new HTTPResponse(resolve);
              return fn(event.request, res);
            }
          }

          if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
            return;
          } //request = credentials: 'include'


          fetch(event.request).then(resolve).catch(reject);
        } catch (e) {
          const res = new HTTPResponse(resolve);
          res.html(...error500(e));
        }
      }));
    });
    ['GET', 'POST', 'DELETE', 'PATCH', 'PUT'].forEach(method => {
      this[method.toLowerCase()] = this.method(method);
    });
  }

  method(method) {
    return function (url, fn) {
      if (!this._routes[method]) {
        this._routes[method] = {};
      }

      this._routes[method][url] = fn;
      return this;
    };
  }

}

exports.Wayne = Wayne;

},{}]},{},[1])(1)
});
