var path = require('path');

module.exports = Class({

  init: function(opts) {
    this.modulePath = opts.modulePath;
    this.modulePackage = opts.modulePackage;
    this.builderInfo = opts.builderInfo;

    this.src = opts.builderInfo.src;
    this.srcPath = path.join(this.modulePath, this.src);

    this.buildPath = path.join(this.modulePath, 'build', this.src);

    this.moduleName = this.modulePackage.name;
  },

  /** Run any tasks required to compile this module, add promises to task array */
  compile: function(tasks) {
    // stub
  },

  watch: function(tasks) {
    // stub
  }

});
