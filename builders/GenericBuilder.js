'use strict';

let path = require('path');
let fs = require('fs');

let gulp = require('gulp');
let plugins = require('gulp-load-plugins')();

let lazy = require('lazy-cache')(require);
lazy('vinyl-source-stream', 'source');
lazy('browserify');
lazy('watchify');
lazy('babelify');
lazy('nib');
lazy('bluebird', 'Promise');
lazy('main-bower-files');
lazy('bower');
lazy('merge-stream');
lazy('devkit-logging', 'logging');

let Builder = require('./Builder');


class GenericBuilder extends Builder {
  constructor (pluginBuilder, opts) {
    super(pluginBuilder, opts);

    this.path = {
      HTML: path.join(this.srcPath, '**', '**.html'),
      HTML_INDEX: path.join(this.srcPath, 'index.html'),
      MINIFIED_OUT: 'build.min.js',
      OUT: 'build.js',
      DEST: this.buildPath,
      DEST_BUILD: path.join(this.buildPath, 'build'),
      DEST_SRC: path.join(this.buildPath, 'src'),
      ENTRY_POINT: path.join(this.srcPath, 'index.js'),
      CSS_ENTRY_POINT: path.join(this.srcPath, 'css', '*.styl'),
      STYLUS_FILES: path.join(this.srcPath, 'css', '**', '*.*'),
      FONT: path.join(this.srcPath, 'fonts', '*.*'),
      DEST_FONT: path.join(this.buildPath, 'fonts'),
      STATIC: path.join(this.srcPath, 'static', '**', '*.*'),
      STATIC_DEST: path.join(this.buildPath, 'static'),
      BOWER_JSON: path.join(this.modulePath, 'bower.json'),
      BOWER_DEST: path.join(this.buildPath, 'bower')
    };

    this.logger = lazy.logging.get('GenericBuilder.' + this.moduleName + '.' + this.src);

    this.compress = false;
    this.sourcemaps = true;
  }


  stylus () {
    return gulp
      .src(this.path.CSS_ENTRY_POINT)
      .pipe(plugins.stylus({

        // cross-platform css rules
        use: lazy.nib(),

        // inline @import-ed css files
        'include css': true,

        // deploy opts
        sourcemap: this.sourcemaps,
        compress: this.compress
      }))
      .pipe(plugins.rename({extname: '.css'}))
      .pipe(gulp.dest(this.path.DEST))
      .pipe(plugins.livereload());
  }


  _bower () {
    return this.runAsPromise('bowerInstall').then(() => {
      return this.runAsPromise('mainBowerFiles');
    });
  }


  bowerInstall () {
    return lazy.bower.commands.install();
  }


  mainBowerFiles () {
    let jsFilter = plugins.filter('**/*.js', {restore: true});
    let cssFilter = plugins.filter('**/*.css', {restore: true});
    let fontFilter = plugins.filter('**/*.{eot,ttf,woff,woff2}');

    let mainStream = gulp.src(lazy.mainBowerFiles())
      .pipe(jsFilter)
        .pipe(plugins.debug({ title: 'bower js' }))
        .pipe(plugins.concat('bower.js'))
        .pipe(jsFilter.restore)
      .pipe(cssFilter)
        .pipe(plugins.debug({ title: 'bower css' }))
        .pipe(plugins.concat('bower.css'))
        .pipe(cssFilter.restore)
      .pipe(gulp.dest(this.path.BOWER_DEST));

    let fontStream = gulp.src(lazy.mainBowerFiles())
      .pipe(fontFilter)
        .pipe(plugins.debug({ title: 'bower fonts' }))
      .pipe(gulp.dest(this.path.DEST_FONT));

    // TODO: this causes double debug logs
    return lazy.mergeStream(mainStream, fontStream);
  }


  copyHtml () {
    return gulp.src(this.path.HTML)
      .pipe(gulp.dest(this.path.DEST))
      .pipe(plugins.livereload());
  }


  copyStatic () {
    return gulp.src(this.path.STATIC)
      .pipe(gulp.dest(this.path.STATIC_DEST))
      .pipe(plugins.livereload());
  }


  font () {
    return gulp.src(this.path.FONT)
      .pipe(gulp.dest(this.path.DEST_FONT));
  }


  _browserify (opts) {
    if (!opts) { opts = {}; }
    if (!opts.entries) { opts.entries = [this.path.ENTRY_POINT]; }
    if (!opts.transform) { opts.transform = [lazy.babelify.configure({stage: 0})]; }
    if (!opts.paths) { opts.paths = [path.join(this.modulePath, 'node_modules')]; }

    return lazy.browserify(opts);
  }


  _watch () {
    this.sourcemaps = true;
    this.compress = false;
    let logger = this.logger;

    if (this.pluginBuilder.opts.livereload) {
      plugins.livereload.listen();
    }

    // Run copy once to make sure development replace happens (index.html)
    return this.runAsPromise('copyHtml').then(() => {
      gulp.watch(this.path.BOWER_JSON, this._bower.bind(this));
      gulp.watch(this.path.HTML, this.copyHtml.bind(this));
      gulp.watch(this.path.STATIC, this.copyStatic.bind(this));
      gulp.watch(this.path.STYLUS_FILES, this.stylus.bind(this));

      let watcher = lazy.watchify(this._browserify({
        debug: true,
        cache: {},
        packageCache: {},
        fullPaths: true
      }));

      watcher.on('update', () => {
        logger.log('updating...');
        watcher.bundle()
          .on('error', err => {
            logger.log(Object.keys(err));
            logger.log(err.toString());
            this.emit('end');
          })
          .pipe(lazy.source(this.path.OUT))
          .pipe(plugins.debug())
          .pipe(gulp.dest(this.path.DEST_SRC))
          .pipe(plugins.livereload());
      })
        .bundle()
        .pipe(lazy.source(this.path.OUT))
        .pipe(gulp.dest(this.path.DEST_SRC));
    });
  }


  build () {
    let logger = this.logger;
    return this._browserify()
      .bundle()
      .on('error', e => {
        logger.error(e.stack || e);
        this.emit('end');
      })
      .pipe(lazy.source(this.path.MINIFIED_OUT))
      .pipe(plugins.streamify(plugins.uglify()))
      .pipe(gulp.dest(this.path.DEST_BUILD));
  }


  replaceHTML () {
    return gulp.src(this.path.HTML)
      .pipe(plugins.htmlReplace({
        'js': 'build/' + this.path.MINIFIED_OUT
      }))
      .pipe(gulp.dest(this.path.DEST));
  }


  runAsPromise (taskName) {
    this.logger.info('Starting:', taskName);
    return new lazy.Promise((resolve, reject) => {
      let stream = (this[taskName].bind(this))();

      if (lazy.Promise.is(stream)) {
        return stream;
      }

      if (!stream) {
        throw new Error('Must return stream or promise (' + taskName + ') got: ' + (typeof stream));
      }

      let onEnd = () => {
        this.logger.info('Complete:', taskName);
        resolve();
      };

      let onError = err => {
        this.logger.info('Error:', taskName, err);
        reject(err);
      };

      stream.on('end', onEnd);
      stream.on('error', onError);
      stream.on('err', onError);
    });
  }


  compile (tasks) {
    tasks.push(this.runAsPromise('copyHtml'));
    tasks.push(this.runAsPromise('copyStatic'));
    if (fs.existsSync(this.path.BOWER_JSON)) {
      tasks.push(this._bower());
    }
    tasks.push(this.runAsPromise('stylus'));
    tasks.push(
      this.runAsPromise('build').then(() => {
        return this.runAsPromise('replaceHTML');
      })
    );
    tasks.push(this.runAsPromise('font'));
  }


  watch (tasks) {
    tasks.push(this.runAsPromise('_watch'));
  }
}

module.exports = GenericBuilder;
