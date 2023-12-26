# Lurk, Leap, Loot

2023 Seven-day Roguelike Challenge (7DRL) Entry

by James McNeill and Damien Moore

## Development

This code is developed using parcel 2 (https://parceljs.org/).

Static files are served with the [parcel-reporter-static-files-copy](https://github.com/elwin013/parcel-reporter-static-files-copy) library.

After cloning the Git repository, run `npm install` to set up dependencies.

To run locally, run `npm run start` and then use a browser to load `http://localhost:1234`. Most of the time, changes to source files will trigger a page reload. Sometimes it will fall over and require a browser hard reload instead. Sometimes beyond that it will require the `.parcel-cache` directory to be deleted and recreated.

To build for distribution run `npm run build` and use the files in the `dist` directory. You may want to clean the directory first to remove older cached built files.
