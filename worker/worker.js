- const child = spawn(command, { shell: true, stdio: 'pipe' });
+ const child = spawn(command, [], { shell: false, stdio: 'pipe' });