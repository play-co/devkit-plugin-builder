'use strict';

let tracer = require('tracer');
let colors = require('colors');

colors.setTheme({
  silly: 'rainbow',
  input: 'grey',
  verbose: 'cyan',
  prompt: 'grey',
  info: 'green',
  data: 'grey',
  help: 'cyan',
  warn: 'yellow',
  debug: 'blue',
  error: 'red'
});

module.exports = {
  verbose: false,
  get: function(name) {
    return tracer.console({
      level: this.verbose ? 'debug' : 'info',
      format : '{{timestamp}}{{name}}\t{{title}}{{message}}', //  (in {{file}}:{{line}})
      dateformat : "HH:MM:ss",
      preprocess :  data => {
        if (this.verbose) {
          data.timestamp = data.timestamp + ' ';
        } else {
          data.timestamp = '';
        }

        data.name = ('[' + name + ']').cyan;
        if (data.title === 'info') {
          data.title = '';
        } else {
          // color titles
          let colored = data.title[data.title];
          data.title = (colored || data.title) + ' ';
        }
        data.timestamp = data.timestamp.gray;
      }
    });
  }
};
