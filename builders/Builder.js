'use strict';

let path = require('path');

class Builder {

  constructor (pluginBuilder, opts) {
    this.pluginBuilder = pluginBuilder;
    this.modulePath = opts.modulePath;
    this.modulePackage = opts.modulePackage;
    this.builderInfo = opts.builderInfo;

    this.src = opts.builderInfo.src;
    this.srcPath = path.join(this.modulePath, this.src);

    this.buildPath = path.join(this.modulePath, 'build', this.src);

    this.moduleName = this.modulePackage.name;
  }

  /** Run any tasks required to compile this module, add promises to task array */
  compile (tasks) {
    // stub
  }

  watch (tasks) {
    // stub
  }
}

module.exports = Builder;
