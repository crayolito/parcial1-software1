/*! JointJS+ v4.0.1 - HTML5 Diagramming Framework - TRIAL VERSION

Copyright (c) 2024 client IO

 2024-09-07


This Source Code Form is subject to the terms of the JointJS+ Trial License
, v. 2.0. If a copy of the JointJS+ License was not distributed with this
file, You can obtain one at https://www.jointjs.com/license
 or from the JointJS+ archive as was distributed by client IO. See the LICENSE file.*/

import * as joint from '@joint/plus';

export class ToolbarService {
  toolbar: joint.ui.Toolbar;

  create(
    commandManager: joint.dia.CommandManager,
    paperScroller: joint.ui.PaperScroller
  ) {
    const { tools, groups } = this.getToolbarConfig();

    this.toolbar = new joint.ui.Toolbar({
      groups,
      tools,
      autoToggle: true,
      references: {
        paperScroller: paperScroller,
        commandManager: commandManager,
      },
    });
  }

  getToolbarConfig() {
    return {
      groups: {
        clear: { index: 1 },
        qr: { index: 2 },
        springBoot: { index: 3 },
        xmlImportar: { index: 4 },
        xmlExportar: { index: 5 },
        jsonImportar: { index: 6 },
        jsonExportar: { index: 7 },
        importar: { index: 8 },
        fullscreen: { index: 9 },
        order: { index: 10 },
        layout: { index: 11 },
        zoom: { index: 12 },
        grid: { index: 13 },
        snapline: { index: 14 },
      },
      tools: [
        {
          type: 'button',
          name: 'xmlImportar',
          group: 'xmlImportar',
          text: 'Enviar xml',
          attrs: {
            button: {
              id: 'btn-importar-xml',
              'data-tooltip': 'Llevar a Architec Enterprise',
              'data-tooltip-position': 'top',
              'data-tooltip-position-selector': '.toolbar-container',
            },
          },
        },
        {
          type: 'button',
          name: 'springBoot',
          group: 'springBoot',
          text: 'Backend',
          attrs: {
            button: {
              id: 'btn-springBoot',
              'data-tooltip': '',
              'data-tooltip-position': 'top',
              'data-tooltip-position-selector': '.toolbar-container',
            },
          },
        },
      ],
    };
  }
}
