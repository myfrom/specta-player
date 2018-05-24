const logger = require('@myfrom/logger'),
      // Tools
      gulp = require('gulp'),
      gulpif = require('gulp-if'),
      del = require('del'),
      mergeStream = require('merge-stream'),
      polymerBuild = require('polymer-build'),
      errorHandler = require('gulp-error-handle'),
      replace = require('gulp-replace'),
      minimatch = require("minimatch"),
      flatmap = require('gulp-flatmap'),
      fs = require('fs').promises,
      path = require('path'),
      workbox = require('workbox-build'),
      // Minifiers
      jsmin = require('google-closure-compiler-js').gulp(),
      htmlmin = require('gulp-htmlmin'),
      svgmin = require('gulp-svgmin'),
      cssmin = require('gulp-clean-css');

const minOptions =
{
  js: {
    'compilationLevel': 'SIMPLE',
    'polymerVersion': 2,
    'languageIn': 'ECMASCRIPT_2017',
    'languageOut': 'ECMASCRIPT6'
  },
  html: {
    'collapseWhitespace': true,
    'removeComments': true
  },
  svg: {
    plugins: [{
      removeComments: true
    },{
      cleanupIDs: false
    }]
  },
  css: {
    level: 1
  }
};

const polymerJson = require('./polymer.json'),
      buildConfig = polymerJson.betterPolymerBuild || {},
      buildDir = buildConfig.buildDirectory || 'build';

/**
 * Waits for the given ReadableStream
 */
function waitFor(stream) {
  return new Promise((resolve, reject) => {
    stream.once('end', resolve);
    stream.once('error', reject);
  });
}

logger.log(logger.chalk`Building into directory {magenta ${__dirname}/${buildDir}}`);
logger.log(logger.chalk`Data from Polymer Project {magenta ${__dirname}/polymer.json}`);



gulp.task('cleanup', () => del([buildDir]));


gulp.task('build', ['cleanup'], async () => {
  const polymerProject = new polymerBuild.PolymerProject(polymerJson);

  // Run sections modifications
  const replaceFiles = {},
        sections = buildConfig.sections || [];
  if (sections.length === 0) return;
  logger.log('Processing sections');
  for (let filename in sections) {
    let file;
    try {
      file = await fs.readFile(path.join(__dirname, filename), 'utf8');
    } catch(err) {
      if (err.code = 'ENOENT')
        logger.log(logger.chalk`Couldn't find file {red ${filename}}, skipping`, 'warningHigh');
      else throw err;
    }
    for (sectionName in sections[filename]) {
      const section = sections[filename][sectionName];
      if (section.action === 'delete-tag') {
        file = file.replace(new RegExp(`^.*::${sectionName}(-END)?::.*\\s`, 'gm'), '');
      } else if (section.action === 'delete-in-between') {
        const errorHandler = err =>
          logger.log(logger.chalk`Couldn't find section {red ${sectionName} in file {magenta ${filename}}, skipping`, 'warningHigh')
        try {
          const start = file.search(new RegExp(`^.*::${sectionName}::`, 'm')),
                length = file.match(new RegExp(`^.*::${sectionName}-END::.*\\s`, 'm'))[0].length,
                end = file.search(new RegExp(`^.*::${sectionName}-END::.*\\s`, 'm')) + length;
          if (start === -1) return void errorHandler({ code: 'NOTFOUND' });
          file = file.replace(file.substring(start, end), '');
        } catch(err) {
          errorHandler(err);
        }
      } else {
        logger.log(logger.chalk`Section {red ${sectionName}} provided with no valid action, skipping`, 'warningHigh');
      }
    }
    replaceFiles[filename] = file;
  }
  logger.log('All sections work done', 'success');

  // Minify code
  logger.log('Getting into minifying your code')
  const ignoredFiles = buildConfig.ignoredFiles || [],
        skipTypes = buildConfig.skipTypes || {},
  shallPass = (file, type) => {
    if (/.*\.min\.[^\.]+$/.test(file.path)) return false;
    const regex = new RegExp(`\.${type}$`);
    let isIgnored = false;
    ignoredFiles.forEach(pattern => {
      if (minimatch(file.path, __dirname + '/' + pattern)) {
        isIgnored = true;
        return;
      }
    });
    return regex.test(file.path) && !isIgnored;
  }

  let sourcesStream = mergeStream(polymerProject.sources(), gulp.src([polymerJson.entrypoint])),
        dependenciesStream = polymerProject.dependencies();

  const externsPath =
      'node_modules/google-closure-compiler-js/contrib/externs/polymer-1.0.js';
  const externsSrc = await fs.readFile(externsPath, 'utf-8');
  minOptions.js.externs = [ {'src': externsSrc, 'path': 'polymer-1.0.js'} ];

  function processor(stream) {
    const streamSplitter = new polymerBuild.HtmlSplitter();

    stream = stream
      .pipe(errorHandler( function(err) {
        logger.log(err.toString(), 'warningHigh');
        this.emit('end');
      }))
      .pipe(gulpif(file => file.relative in replaceFiles, replace(/(?:.|\s)*/gm,
        function(match) {
          return match ? replaceFiles[this.file.relative] : '';
        })))
      .pipe(streamSplitter.split())
      .pipe(gulpif(file => !skipTypes.svg && shallPass(file, 'svg'), svgmin(minOptions.svg)))
      // Closure compiles into one file so we need to split it
      .pipe(gulpif(file => !skipTypes.js && shallPass(file, 'js'), flatmap((stream, file) =>
        stream.pipe(jsmin(Object.assign(minOptions.js, { jsOutputFile: file.path }))))))
      .pipe(gulpif(file => !skipTypes.css && shallPass(file, 'css'), cssmin(minOptions.css)))
      .pipe(gulpif(file => !skipTypes.html && shallPass(file, 'html'), htmlmin(minOptions.html)));
    
    return stream.pipe(streamSplitter.rejoin());
  };

  const processed = [];
  !buildConfig.skipSources && processed.push(processor(sourcesStream));
  !buildConfig.skipDependencies && processed.push(processor(dependenciesStream));

  const finalStream = mergeStream(...processed).pipe(gulp.dest(buildDir));
  
  await waitFor(finalStream);
  logger.log('Finished building files', 'success');
});


gulp.task('generate-sw', ['build'], async () => {
  await fs.writeFile(path.join(__dirname, buildDir, 'service-worker.js'), 'utf8');
  await workbox.injectManifest({
    swSrc: 'service-worker.js',
    swDest: path.join(buildDir, 'service-worker.js'),
    globDirectory: buildDir,
    globPatterns: ['**/*.*']
  });
});


gulp.task('default', ['cleanup', 'build', 'generate-sw'])