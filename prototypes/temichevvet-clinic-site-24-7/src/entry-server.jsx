import React from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App.jsx';
export const render = path => renderToString(<App initialPath={path} />);
