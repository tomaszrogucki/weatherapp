"use strict";

module.exports = function(grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        connect: {
            server: {
                options: {
                    port: 8888,
                    base: '.',
                    livereload: 3000
                }
            }
        },
        handlebars: {
        	options: {
        		namespace: 'Handlebars.templates',
        		processName: function(filePath) {
        			return filePath.replace(/^templates\//, '').replace(/\.hbs$/, '');
        		} 
        	},
        	'build/templates.js': ['templates/*.hbs']
        },
        browserify: {
        	options: {
        		transform: ['hbsfy']
        	},
        	'build/boundle.js': 'js/index.js'
        },
        watch: {
        	options: {
        		livereload: 3000,
    		},
        	files: ['js/*', 'css/*', 'templates/*', '*.html'],
        	tasks: ['handlebars', 'browserify']
        }
    });
    
    grunt.loadNpmTasks('grunt-contrib-connect');
    grunt.loadNpmTasks('grunt-contrib-handlebars');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    
    grunt.registerTask('default', ['connect', 'handlebars', 'browserify', 'watch']);
};
