#!/usr/bin/env node
import { createProgram } from './cli/commands.js';

const program = createProgram();
program.parse(process.argv);
