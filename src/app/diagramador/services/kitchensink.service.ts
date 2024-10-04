/*! JointJS+ v4.0.1 - HTML5 Diagramming Framework - TRIAL VERSION

Copyright (c) 2024 client IO

 2024-09-07


This Source Code Form is subject to the terms of the JointJS+ Trial License
, v. 2.0. If a copy of the JointJS+ License was not distributed with this
file, You can obtain one at https://www.jointjs.com/license
 or from the JointJS+ archive as was distributed by client IO. See the LICENSE file.*/
import { HttpClient } from '@angular/common/http';
import { DirectedGraph } from '@joint/layout-directed-graph';
import * as joint from '@joint/plus';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import pluralize from 'pluralize';
import { v4 as uuidv4 } from 'uuid';
import { environment } from '../../../environments/environment';
import {
  AtributoClase,
  ConnectorXML,
  ElementoCabezera,
  ElementoClase,
  ElementoLink,
} from '../interfaces/jsonJoint.interface';
import {
  AtributosSB,
  ClassJPA,
  TicketOneToOne,
} from '../interfaces/springBoot';
import * as appShapes from '../shapes/app-shapes';
import { HaloService } from './halo.service';
import { InspectorService } from './inspector.service';
import { KeyboardService } from './keyboard.service';
import { StencilService } from './stencil.service';
import { ToolbarService } from './toolbar.service';

class KitchenSinkService {
  public viewModalQR: boolean = false;
  private apiUrl = environment.apiUrl;
  public http: HttpClient;
  el: HTMLElement;

  graph: joint.dia.Graph;
  paper: joint.dia.Paper;
  paperScroller: joint.ui.PaperScroller;

  commandManager: joint.dia.CommandManager;
  snaplines: joint.ui.Snaplines;
  clipboard: joint.ui.Clipboard;
  selection: joint.ui.Selection;
  navigator: joint.ui.Navigator;

  stencilService: StencilService;
  toolbarService: ToolbarService;
  inspectorService: InspectorService;
  haloService: HaloService;
  keyboardService: KeyboardService;
  constructor(
    el: HTMLElement,
    stencilService: StencilService,
    toolbarService: ToolbarService,
    inspectorService: InspectorService,
    haloService: HaloService,
    keyboardService: KeyboardService,
    http: HttpClient
  ) {
    this.http = http;
    this.el = el;
    // apply current joint js theme
    const view = new joint.mvc.View({ el });
    view.delegateEvents({
      'mouseup input[type="range"]': (evt) => evt.target.blur(),
    });

    this.stencilService = stencilService;
    this.toolbarService = toolbarService;
    this.inspectorService = inspectorService;
    this.haloService = haloService;
    this.keyboardService = keyboardService;
  }

  startRappid() {
    // READ : CAMBIAMOS EL FONDOS DE LA APLICACION
    joint.setTheme('modern');

    this.initializePaper();
    this.initializeStencil();
    this.initializeSelection();
    this.initializeToolsAndInspector();
    this.initializeNavigator();
    this.initializeToolbar();
    this.initializeKeyboardShortcuts();
    this.initializeTooltips();
  }

  initializePaper() {
    const graph = (this.graph = new joint.dia.Graph(
      {},
      {
        cellNamespace: appShapes,
      }
    ));

    this.commandManager = new joint.dia.CommandManager({ graph: graph });

    const paper = (this.paper = new joint.dia.Paper({
      width: 1000,
      height: 1000,
      gridSize: 10,
      drawGrid: true,
      model: graph,
      cellViewNamespace: appShapes,
      defaultLink: <joint.dia.Link>new appShapes.app.Link(),
      defaultConnectionPoint: appShapes.app.Link.connectionPoint,
      interactive: { linkMove: false },
      async: true,
      sorting: joint.dia.Paper.sorting.APPROX,
    }));

    paper.on('blank:contextmenu', (evt) => {
      const x = evt.clientX ?? 0; // Proporcionar un valor predeterminado de 0 si es undefined
      const y = evt.clientY ?? 0; // Proporcionar un valor predeterminado de 0 si es undefined
      this.renderContextToolbar({ x, y });
    });

    paper.on('cell:contextmenu', (cellView, evt) => {
      const x = evt.clientX ?? 0; // Proporcionar un valor predeterminado de 0 si es undefined
      const y = evt.clientY ?? 0; // Proporcionar un valor predeterminado de 0 si es undefined
      this.renderContextToolbar({ x, y }, [cellView.model]);
    });
    this.snaplines = new joint.ui.Snaplines({ paper: paper });

    const paperScroller = (this.paperScroller = new joint.ui.PaperScroller({
      paper,
      autoResizePaper: true,
      scrollWhileDragging: true,
      cursor: 'grab',
    }));

    this.renderPlugin('.paper-container', paperScroller);
    paperScroller.render().center();

    paper.on('paper:pan', (evt, tx, ty) => {
      evt.preventDefault();
      paperScroller.el.scrollLeft += tx;
      paperScroller.el.scrollTop += ty;
    });

    paper.on('paper:pinch', (_evt, ox, oy, scale) => {
      // the default is already prevented
      const zoom = paperScroller.zoom();
      paperScroller.zoom(zoom * scale, {
        min: 0.2,
        max: 5,
        ox,
        oy,
        absolute: true,
      });
    });
  }

  initializeStencil() {
    const { stencilService, paperScroller, snaplines } = this;
    stencilService.create(paperScroller, snaplines);

    this.renderPlugin('.stencil-container', stencilService.stencil);
    stencilService.setShapes();

    stencilService.stencil.on(
      'element:drop',
      (elementView: joint.dia.ElementView) => {
        this.selection.collection.reset([elementView.model]);
      }
    );
  }

  initializeSelection() {
    this.clipboard = new joint.ui.Clipboard();
    this.selection = new joint.ui.Selection({
      paper: this.paperScroller,
      useModelGeometry: true,
      translateConnectedLinks:
        joint.ui.Selection.ConnectedLinksTranslation.SUBGRAPH,
    });
    this.selection.collection.on(
      'reset add remove',
      this.onSelectionChange.bind(this)
    );

    const keyboard = this.keyboardService.keyboard;

    // Initiate selecting when the user grabs the blank area of the paper while the Shift key is pressed.
    // Otherwise, initiate paper pan.
    this.paper.on(
      'blank:pointerdown',
      (evt: joint.dia.Event, _x: number, _y: number) => {
        if (keyboard.isActive('shift', evt)) {
          this.selection.startSelecting(evt);
        } else {
          this.selection.collection.reset([]);
          this.paperScroller.startPanning(evt);
          this.paper.removeTools();
        }
      }
    );

    // Initiate selecting when the user grabs a cell while shift is pressed.
    this.paper.on(
      'cell:pointerdown element:magnet:pointerdown',
      (cellView: joint.dia.CellView, evt: joint.dia.Event) => {
        if (keyboard.isActive('shift', evt)) {
          cellView.preventDefaultInteraction(evt);
          this.selection.startSelecting(evt);
        }
      }
    );

    this.paper.on(
      'element:pointerdown',
      (elementView: joint.dia.ElementView, evt: joint.dia.Event) => {
        // Select an element if CTRL/Meta key is pressed while the element is clicked.
        if (keyboard.isActive('ctrl meta', evt)) {
          this.selection.collection.add(elementView.model);
        }
      }
    );

    this.selection.on(
      'selection-box:pointerup',
      (elementView: joint.dia.ElementView, evt: joint.dia.Event) => {
        if (evt.button === 2) {
          evt.stopPropagation();
          const x = evt.clientX ?? 0; // Proporcionar un valor predeterminado de 0 si es undefined
          const y = evt.clientY ?? 0; // Proporcionar un valor predeterminado de 0 si es undefined
          this.renderContextToolbar(
            { x, y },
            this.selection.collection.toArray()
          );
        }
      },
      this
    );
  }

  renderContextToolbar(
    point: joint.dia.Point,
    cellsToCopy: joint.dia.Cell[] = []
  ) {
    this.selection.collection.reset(cellsToCopy);
    const contextToolbar = new joint.ui.ContextToolbar({
      target: point,
      root: this.paper.el,
      padding: 0,
      vertical: true,
      anchor: 'top-left',
      tools: [
        {
          action: 'copy',
          content: 'Copy',
          attrs: {
            disabled: cellsToCopy.length === 0,
          },
        },
        {
          action: 'paste',
          content: 'Paste',
          attrs: {
            disabled: this.clipboard.isEmpty(),
          },
        },
      ],
    });

    contextToolbar.on('action:copy', () => {
      contextToolbar.remove();

      this.clipboard.copyElements(cellsToCopy, this.graph);
    });

    contextToolbar.on('action:paste', () => {
      contextToolbar.remove();
      const pastedCells = this.clipboard.pasteCellsAtPoint(
        this.graph,
        this.paper.clientToLocalPoint(point)
      );

      const elements = pastedCells.filter((cell) => cell.isElement());

      // Make sure pasted elements get selected immediately. This makes the UX better as
      // the user can immediately manipulate the pasted elements.
      this.selection.collection.reset(elements);
    });
    contextToolbar.render();
  }

  onSelectionChange() {
    const { paper, selection } = this;
    const { collection } = selection;
    paper.removeTools();
    joint.ui.Halo.clear(paper);
    joint.ui.FreeTransform.clear(paper);
    joint.ui.Inspector.close();
    if (collection.length === 1) {
      const primaryCell: joint.dia.Cell = collection.first();
      const primaryCellView = paper.findViewByModel(primaryCell);
      selection.destroySelectionBox(primaryCell);
      this.selectPrimaryCell(primaryCellView);
    } else if (collection.length === 2) {
      collection.each(function (cell: joint.dia.Cell) {
        selection.createSelectionBox(cell);
      });
    }
  }

  selectPrimaryCell(cellView: joint.dia.CellView) {
    const cell = cellView.model;
    if (cell.isElement()) {
      this.selectPrimaryElement(<joint.dia.ElementView>cellView);
    } else {
      this.selectPrimaryLink(<joint.dia.LinkView>cellView);
    }
    this.inspectorService.create(cell);
  }

  selectPrimaryElement(elementView: joint.dia.ElementView) {
    const element = elementView.model;

    new joint.ui.FreeTransform({
      cellView: elementView,
      allowRotation: false,
      preserveAspectRatio: !!element.get('preserveAspectRatio'),
      allowOrthogonalResize: element.get('allowOrthogonalResize') !== false,
    }).render();

    this.haloService.create(elementView);
  }

  selectPrimaryLink(linkView: joint.dia.LinkView) {
    const ns = joint.linkTools;
    const toolsView = new joint.dia.ToolsView({
      name: 'link-pointerdown',
      tools: [
        new ns.Vertices(),
        new ns.SourceAnchor(),
        new ns.TargetAnchor(),
        new ns.SourceArrowhead(),
        new ns.TargetArrowhead(),
        new ns.Segments(),
        new ns.Boundary({ padding: 15 }),
        new ns.Remove({ offset: -20, distance: 40 }),
      ],
    });

    linkView.addTools(toolsView);
  }

  initializeToolsAndInspector() {
    this.paper.on('cell:pointerup', (cellView: joint.dia.CellView) => {
      const cell = cellView.model;
      const { collection } = this.selection;
      if (collection.includes(cell)) {
        return;
      }
      collection.reset([cell]);
    });

    this.paper.on('link:mouseenter', (linkView: joint.dia.LinkView) => {
      // Open tool only if there is none yet
      if (linkView.hasTools()) {
        return;
      }

      const ns = joint.linkTools;
      const toolsView = new joint.dia.ToolsView({
        name: 'link-hover',
        tools: [
          new ns.Vertices({ vertexAdding: false }),
          new ns.SourceArrowhead(),
          new ns.TargetArrowhead(),
        ],
      });

      linkView.addTools(toolsView);
    });

    this.paper.on('link:mouseleave', (linkView: joint.dia.LinkView) => {
      // Remove only the hover tool, not the pointerdown tool
      if (linkView.hasTools('link-hover')) {
        linkView.removeTools();
      }
    });

    this.graph.on('change', (cell: joint.dia.Cell, opt: any) => {
      if (!cell.isLink() || !opt.inspector) {
        return;
      }

      // LOGIC : CUANDO HAY UN CAMBIO EN LA CREACION DE ATRIBUTOS
      console.log('cambio algo aqui');

      const ns = joint.linkTools;
      const toolsView = new joint.dia.ToolsView({
        name: 'link-inspected',
        tools: [new ns.Boundary({ padding: 15 })],
      });

      cell.findView(this.paper).addTools(toolsView);
    });
  }

  initializeNavigator() {
    const navigator = (this.navigator = new joint.ui.Navigator({
      width: 240,
      height: 115,
      paperScroller: this.paperScroller,
      zoom: false,
      paperOptions: {
        async: true,
        sorting: joint.dia.Paper.sorting.NONE,
        elementView: appShapes.NavigatorElementView,
        linkView: appShapes.NavigatorLinkView,
        cellViewNamespace: {
          /* no other views are accessible in the navigator */
        },
      },
    }));

    this.renderPlugin('.navigator-container', navigator);
  }

  convertirCadenaALista(cadena: string): AtributoClase[] {
    // Paso 1: Eliminar todos los \\n
    const cadenaSinSaltos = cadena.replace(/\\n/g, '');

    // Paso 2: Dividir la cadena por el símbolo -
    const lista = cadenaSinSaltos.split('-');

    // Paso 3: Filtrar los elementos vacíos
    const listaFiltrada = lista.filter((item) => item.trim() !== '');

    // Devolver la lista de cadenas
    listaFiltrada.map((item) => item.trim());

    // Paso 4: Crear la lista de atributos
    let listaAtributos: AtributoClase[] = [];
    listaFiltrada.forEach((item) => {
      let atributo: AtributoClase = {
        id: uuidv4(),
        titulo: item,
      };
      listaAtributos.push(atributo);
    });

    return listaAtributos;
  }

  tipoCabecera(tipo: string): string {
    switch (tipo) {
      case 'M 0 0 0 0':
        return 'ASOCIACION';
      case 'M -10 0 0 10 10 0 0 -10 z':
        return 'COMPOSICION';
      case 'M 0 -10 15 0 0 10 z':
        return 'AGREGACION';
      case 'M 0 -10 -15 0 0 10 z':
        return 'HERENCIA';
      case 'M 0 -10 L 2.94 -3.09 L 9.51 -3.09 L 4.29 1.18 L 6.18 8.09 L 0 5 L -6.18 8.09 L -4.29 1.18 L -9.51 -3.09 L -2.94 -3.09 Z':
        return 'DEPENDENCIA';
      default:
        return 'ASOCIACION';
    }
  }

  getC0andCI(
    link: ElementoLink,
    elementosClase: ElementoClase[]
  ): ElementoClase[] {
    let clasesUso: ElementoClase[] = [];
    let sourceClase: ElementoClase = elementosClase.find(
      (elementoClase) => elementoClase.id == link.origen.id
    )!;
    let targetClase: ElementoClase = elementosClase.find(
      (elementoClase) => elementoClase.id == link.destino.id
    )!;

    if (sourceClase.titulo.includes('_')) {
      clasesUso.push(targetClase);
      clasesUso.push(sourceClase);
    } else {
      clasesUso.push(sourceClase);
      clasesUso.push(targetClase);
    }

    return clasesUso;
  }

  getClaseFByName(
    claseOxClaseI: ElementoClase[],
    elementosClase: ElementoClase[]
  ): ElementoClase {
    let claseUso: ElementoClase;

    let claseI = claseOxClaseI[1].titulo;
    let partes = claseI.split('_');
    let tituloClaseF = partes[partes.length - 1];
    console.log(claseOxClaseI[0].titulo);
    console.log(tituloClaseF);
    console.log(claseI);
    if (tituloClaseF == claseOxClaseI[0].titulo) {
      tituloClaseF = partes[0];
    }

    claseUso = elementosClase.find(
      (elementoClase) => elementoClase.titulo == tituloClaseF
    )!;
    console.log(claseUso);
    return claseUso;
  }

  getLinkCIxClaseF(
    claseI: ElementoClase,
    claseF: ElementoClase,
    elementosLinks: ElementoLink[]
  ): ElementoLink {
    let linkResult: ElementoLink;

    elementosLinks.forEach((elementoLink) => {
      if (elementoLink.atributos.length == 1) {
        if (
          claseI.id == elementoLink.origen.id &&
          claseF.id == elementoLink.destino.id
        ) {
          linkResult = elementoLink;
          return;
        }

        if (
          claseI.id == elementoLink.destino.id &&
          claseF.id == elementoLink.origen.id
        ) {
          linkResult = elementoLink;
          return;
        }
      }
    });

    return linkResult!;
  }

  initializeToolbar() {
    this.toolbarService.create(this.commandManager, this.paperScroller);

    this.toolbarService.toolbar.on({
      'springBoot:pointerclick': () => {
        const jsonJoint = this.graph.toJSON();
        let elementosClases: ElementoClase[] = [];
        let elementosLinks: ElementoLink[] = [];
        let ticketsOneToOne: TicketOneToOne[] = [];
        jsonJoint.cells.forEach((cell: any) => {
          if (cell.type == 'standard.HeaderedRectangle') {
            let elementoClase: ElementoClase = {
              titulo: cell.attrs.headerText.text,
              id: cell.id,
              posicion: [cell.position.x, cell.position.y],
              size: [cell.size.width, cell.size.height],
              atributos: this.convertirCadenaALista(
                cell.attrs.bodyText.textWrap.text
              ),
              color: cell.attrs.body.stroke,
            };
            elementosClases.push(elementoClase);
          } else if (cell.type == 'app.Link') {
            let cabezeraOrigen: ElementoCabezera = {
              id: cell.source.id,
              tipo: cell.attrs?.line?.sourceMarker?.d ?? 'M 0 0 0 0',
              normal: this.tipoCabecera(cell.attrs?.line?.sourceMarker?.d),
            };

            let cabezeraDestino: ElementoCabezera = {
              id: cell.target.id,
              tipo: cell.attrs?.line?.targetMarker?.d ?? 'M 0 0 0 0',
              normal: this.tipoCabecera(cell.attrs?.line?.targetMarker?.d),
            };

            let elementoLink: ElementoLink = {
              id: cell.id,
              origen: cabezeraOrigen,
              destino: cabezeraDestino,
              atributos: cell.labels.map((label: any) => label.attrs.text.text),
            };
            elementosLinks.push(elementoLink);
          }
        });

        // READ : PAQUETES CLASES JPA
        let clasesJPA: ClassJPA[] = [];

        elementosClases.forEach((elementoClase) => {
          let atributosEspeciales: string[] = [];
          if (elementoClase.color == '#ffd628') {
            return;
          }

          //LOGIC : Crear una lista de atributos de la clase
          let atributosClase: AtributosSB[] = elementoClase.atributos.map(
            (atributo) => {
              return this.parsearAtributo(atributo.titulo);
            }
          );

          // LOGIC : Atributos de la clase en formato JPA
          let atributosJPA: string = atributosClase
            .map((atributo) => {
              return `private ${atributo.tipo} ${atributo.nombre};`;
            })
            .join('\n');

          let jpaClase: string = `
package com.example.parcial1sw1.modelos;
import jakarta.persistence.*;
import lombok.Data;
import java.io.Serializable;
import java.util.List;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table (name = "${elementoClase.titulo.toLocaleLowerCase()}")
public class ${elementoClase.titulo} implements Serializable {
@Id
@GeneratedValue(strategy = GenerationType.SEQUENCE)
${atributosJPA}
`;

          for (let elementoLink of elementosLinks) {
            if (
              elementoLink.origen.id != elementoClase.id &&
              elementoLink.destino.id != elementoClase.id
            ) {
              continue;
            }

            if (
              elementoLink.origen.id == elementoClase.id &&
              elementoLink.destino.id == elementoClase.id
            ) {
              jpaClase += `
@ManyToOne
@JoinColumn(name = "id_padre_${elementoClase.titulo.toLowerCase()}")
private ${elementoClase.titulo} ${elementoClase.titulo.toLowerCase()}Padre;

@OneToMany(mappedBy = "${elementoClase.titulo.toLowerCase()}Padre", cascade = CascadeType.ALL)
private List<${elementoClase.titulo}> sub${pluralize(
                elementoClase.titulo.toLowerCase()
              )};
              `;
              atributosEspeciales.push(
                this.capitalizeFirstLetter(
                  `${elementoClase.titulo.toLowerCase()}Padre`
                )
              );
              atributosEspeciales.push(
                this.capitalizeFirstLetter(
                  `sub${pluralize(elementoClase.titulo.toLowerCase())}`
                )
              );
              continue;
            }

            //LOGIC : Verificar que tenga solo un atributo
            // if (
            //   elementoLink.atributos.length == 1 &&
            //   elementoClase.color != '#ffd628'
            // ) {
            if (elementoLink.atributos.length == 1) {
              // READ : CLASE_A LINK CLASE_A_B LINK CLASE_B
              // LOGIC : ALMACENA LA CLASE ORIGEN Y LA INTERMEDIA
              let claseOxClaseI: ElementoClase[] = [];
              // LOGIC : FUNCION PARA BUSCAR SU OTRA MITAD
              claseOxClaseI = this.getC0andCI(elementoLink, elementosClases);
              // LOGIC : ALMACENA LA CLASE FINAL
              let claseF: ElementoClase;
              // LOGIC : FUNCION PARA BUSCAR LA CLASE FINAL
              claseF = this.getClaseFByName(claseOxClaseI, elementosClases);
              // LOGIC : PARA ALMACENAR Y BUSCAR EL LINK ENTRE LA INTERMDIA Y LA FINAL
              let linkTarget: ElementoLink;
              linkTarget = this.getLinkCIxClaseF(
                claseOxClaseI[1],
                claseF,
                elementosLinks
              );

              if (
                elementoLink.atributos[0].includes('0...*') ||
                elementoLink.atributos[0].includes('*...0')
              ) {
                jpaClase += `
@ManyToMany
@JoinTable(
name = "${claseOxClaseI[1].titulo.toLowerCase()}",
joinColumns = @JoinColumn(name = "id_${claseOxClaseI[0].titulo.toLowerCase()}"),
inverseJoinColumns = @JoinColumn(name = "id_${claseF.titulo.toLowerCase()}")
)
private List<${claseF.titulo}> ${pluralize(claseF.titulo.toLowerCase())};
                `;
                atributosEspeciales.push(
                  this.capitalizeFirstLetter(
                    pluralize(claseF.titulo.toLowerCase())
                  )
                );
              } else {
                jpaClase += `
@ManyToMany(mappedBy = "${pluralize(claseOxClaseI[0].titulo.toLowerCase())}")
private List<${claseF.titulo}> ${pluralize(claseF.titulo.toLowerCase())};
                `;

                atributosEspeciales.push(
                  this.capitalizeFirstLetter(
                    pluralize(claseF.titulo.toLowerCase())
                  )
                );
              }
            } else {
              // LOGIC : Verificar si tiene dos atributos
              // LOGIC : Verificar si esta unida al origen
              let claseTrabajo: ElementoClase;
              let relacionesClaseJPA: string;
              if (elementoLink.origen.id == elementoClase.id) {
                claseTrabajo = this.encontrarClaseTrabajo(
                  'origen',
                  elementoLink,
                  elementosClases
                );
                // LOGIC : HACER RELACION DE CLASES A JPA
                const [relacionesJPA, tickes, attrEspeciales] =
                  this.relacionesClaseJPA(
                    elementoClase,
                    elementoLink,
                    claseTrabajo,
                    'origen',
                    ticketsOneToOne,
                    atributosEspeciales
                  );
                atributosEspeciales = attrEspeciales;
                relacionesClaseJPA = relacionesJPA;
                ticketsOneToOne = tickes;
                jpaClase += relacionesClaseJPA;
              } else {
                // LOGIC : Verificar si esta unida al final
                claseTrabajo = this.encontrarClaseTrabajo(
                  'destino',
                  elementoLink,
                  elementosClases
                );
                const [relacionesJPA, tickes, attrEspeciales] =
                  this.relacionesClaseJPA(
                    elementoClase,
                    elementoLink,
                    claseTrabajo,
                    'destino',
                    ticketsOneToOne,
                    atributosEspeciales
                  );
                atributosEspeciales = attrEspeciales;
                relacionesClaseJPA = relacionesJPA;
                ticketsOneToOne = tickes;
                jpaClase += relacionesClaseJPA;
              }
            }
          }
          // clasesJPA.push(jpaClase + '\n}');
          clasesJPA.push({
            contenido: jpaClase + '\n}',
            attrsEspeciales: atributosEspeciales,
          });
        });

        // READ : PAQUETES REPOSITORIOS

        // READ : PAQUETES CONTROLADORES

        // READ : PAQUETES SERVICIOS

        const zip = new JSZip();
        const carpetaModelos = zip.folder('modelos');
        const carpetaServicios = zip.folder('servicios');
        const carpetaControladores = zip.folder('controladores');
        const carpetaRepositorios = zip.folder('repositorios');

        clasesJPA.forEach((claseJPA) => {
          const nombreClase = this.extraerNombreClase(claseJPA.contenido);
          const nombreArchivo = nombreClase + '.java';

          carpetaModelos!.file(nombreArchivo, claseJPA.contenido);

          carpetaRepositorios!.file(
            nombreClase + 'Repositorio.java',
            this.generarRepositorio(nombreClase)
          );

          carpetaServicios!.file(
            nombreClase + 'Servicio.java',
            this.generarServicio(nombreClase, claseJPA)
          );

          carpetaControladores!.file(
            nombreClase + 'Controlador.java',
            this.generarControlador(nombreClase)
          );
        });

        zip.generateAsync({ type: 'blob' }).then((content) => {
          saveAs(content, 'paquetes.zip');
        });
      },
      'xmlImportar:pointerclick': () => {
        const jsonJoint = this.graph.toJSON();
        let elementosClases: ElementoClase[] = [];
        let elementosLinks: ElementoLink[] = [];
        let linkOcupados: ElementoLink[] = [];
        let diagramElement: string[] = [];
        let connectorsXML: ConnectorXML[] = [];
        jsonJoint.cells.forEach((cell: any) => {
          if (cell.type == 'standard.HeaderedRectangle') {
            let elementoClase: ElementoClase = {
              titulo: cell.attrs.headerText.text,
              id: cell.id,
              posicion: [cell.position.x, cell.position.y],
              size: [cell.size.width, cell.size.height],
              atributos: this.convertirCadenaALista(
                cell.attrs.bodyText.textWrap.text
              ),
              color: cell.attrs.body.stroke,
            };
            elementosClases.push(elementoClase);
          } else if (cell.type == 'app.Link') {
            let cabezeraOrigen: ElementoCabezera = {
              id: cell.source.id,
              tipo: cell.attrs?.line?.sourceMarker?.d ?? 'M 0 0 0 0',
              normal: this.tipoCabecera(cell.attrs?.line?.sourceMarker?.d),
            };

            let cabezeraDestino: ElementoCabezera = {
              id: cell.target.id,
              tipo: cell.attrs?.line?.targetMarker?.d ?? 'M 0 0 0 0',
              normal: this.tipoCabecera(cell.attrs?.line?.targetMarker?.d),
            };

            let elementoLink: ElementoLink = {
              id: cell.id,
              origen: cabezeraOrigen,
              destino: cabezeraDestino,
              atributos: cell.labels.map((label: any) => label.attrs.text.text),
            };
            elementosLinks.push(elementoLink);
          }
        });

        let cabezaXML = `<?xml version="1.0" encoding="windows-1252"?>
            <xmi:XMI xmlns:uml="http://www.omg.org/spec/UML/20131001"
            xmlns:xmi="http://www.omg.org/spec/XMI/20131001"
            xmlns:umldi="http://www.omg.org/spec/UML/20131001/UMLDI"
            xmlns:dc="http://www.omg.org/spec/UML/20131001/UMLDC">
            <xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5" />
            <uml:Model xmi:type="uml:Model" name="EA_Model">
        `;

        let connectors: string = '<connectors>';
        for (let elementoLink of elementosLinks) {
          // Verificar si el elementoLink ya está en linkOcupados
          if (linkOcupados.some((link) => link.id === elementoLink.id)) {
            continue; // Saltar a la siguiente iteración si el link ya está ocupado
          }
          if (elementoLink.atributos.length == 1) {
            let idUnificado: string = uuidv4();

            // READ : CLASE_A LINK CLASE_A_B LINK CLASE_B
            // LOGIC : ALMACENA LA CLASE INTERMDIA AQUI
            let claseOxClaseI: ElementoClase[] = [];
            // LOGIC : FUNCION PARA BUSCAR SU OTRA MITAD
            claseOxClaseI = this.getC0andCI(elementoLink, elementosClases);

            // LOGIC : ALMACENA LA CLASE FINAL
            let claseF: ElementoClase;
            // LOGIC : FUNCION PARA BUSCAR LA CLASE FINAL
            claseF = this.getClaseFByName(claseOxClaseI, elementosClases);
            // LOGIC : PARA ALMACENAR Y BUSCAR EL LINK ENTRE LA INTERMDIA Y LA FINAL
            let linkTarget: ElementoLink;
            linkTarget = this.getLinkCIxClaseF(
              claseOxClaseI[1],
              claseF,
              elementosLinks
            );

            connectors += `
            	<connector xmi:idref="${idUnificado}">
                <source xmi:idref="${claseOxClaseI[0].id}">
                  <type multiplicity="${elementoLink.atributos[0]}" aggregation="none" containment="Unspecified" />
                </source>
                <target xmi:idref="${claseF.id}">
                  <type multiplicity="${linkTarget.atributos[0]}" aggregation="none" containment="Unspecified" />
                </target>
                <properties ea_type="Association" subtype="Class" direction="Unspecified" />
                <labels lb="${elementoLink.atributos[0]}" rb="${linkTarget.atributos[0]}" />
                <extendedProperties associationclass="${claseOxClaseI[1].id}" />
              </connector>
            `;

            linkOcupados.push(elementoLink);
            linkOcupados.push(linkTarget);
            diagramElement.push(idUnificado);
            connectorsXML.push({
              id: idUnificado,
              origen: claseOxClaseI[0].id,
              destino: claseF.id,
              destinoType: 'none',
              properties: 'Association',
              intermedia: claseOxClaseI[1].id,
            });
          } else {
            if (elementoLink.destino.normal == 'ASOCIACION') {
              connectors += `
              <connector xmi:idref="${elementoLink.id}">
                <source xmi:idref="${elementoLink.origen.id}">
                  <type multiplicity="${
                    elementoLink.atributos[0] ?? ''
                  }" aggregation="none" containment="Unspecified" />
                </source>
                <target xmi:idref="${elementoLink.destino.id}">
                  <type multiplicity="${
                    elementoLink.atributos[1] ?? ''
                  }" aggregation="none" containment="Unspecified" />
                </target>
                <properties ea_type="Association" direction="Unspecified" />
                <labels lb="${elementoLink.atributos[0] ?? ''}" rb="${
                elementoLink.atributos[1] ?? ''
              }"/>
      				  <extendedProperties />
              </connector>
              `;

              connectorsXML.push({
                id: elementoLink.id,
                origen: elementoLink.origen.id,
                destino: elementoLink.destino.id,
                destinoType: 'none',
                properties: 'Association',
                intermedia: '',
              });
            }

            if (elementoLink.destino.normal == 'HERENCIA') {
              connectors += `
              <connector xmi:idref="${elementoLink.id}">
                <source xmi:idref="${elementoLink.origen.id}">
                  <type multiplicity="${
                    elementoLink.atributos[0] ?? ''
                  }" aggregation="none" containment="Unspecified" />
                </source>
                <target xmi:idref="${elementoLink.destino.id}">
                  <type multiplicity="${
                    elementoLink.atributos[1] ?? ''
                  }" aggregation="none" containment="Unspecified" />
                </target>
                <properties ea_type="Generalization"/>
                <labels lb="${elementoLink.atributos[0] ?? ''}" rb="${
                elementoLink.atributos[1] ?? ''
              }"/>
        				<extendedProperties />
              </connector>
              `;

              connectorsXML.push({
                id: elementoLink.id,
                origen: elementoLink.origen.id,
                destino: elementoLink.destino.id,
                destinoType: 'none',
                properties: 'Generalization',
                intermedia: 'esG',
              });
            }

            if (elementoLink.destino.normal == 'COMPOSICION') {
              connectors += `
                <connector xmi:idref="${elementoLink.id}">
                  <source xmi:idref="${elementoLink.origen.id}">
                    <type multiplicity="${
                      elementoLink.atributos[0] ?? ''
                    }" aggregation="none" containment="Unspecified" />
                  </source>
                  <target  xmi:idref="${elementoLink.destino.id}">
                    <type multiplicity="${
                      elementoLink.atributos[1] ?? ''
                    }" aggregation="composite" containment="Unspecified" />
                  </target>
                  <properties ea_type="Aggregation" />
                  <labels lb="${elementoLink.atributos[0] ?? ''}" rb="${
                elementoLink.atributos[1] ?? ''
              }"/>
                  <extendedProperties />
                </connector>
              `;

              connectorsXML.push({
                id: elementoLink.id,
                origen: elementoLink.origen.id,
                destino: elementoLink.destino.id,
                destinoType: 'composite',
                properties: 'Aggregation',
                intermedia: '',
              });
            }

            if (elementoLink.destino.normal == 'AGREGACION') {
              connectors += `
               <connector xmi:idref="${elementoLink.id}">
                  <source xmi:idref="${elementoLink.origen.id}">
                    <type multiplicity="${
                      elementoLink.atributos[0] ?? ''
                    }" aggregation="none" containment="Unspecified" />
                  </source>
                  <target  xmi:idref="${elementoLink.destino.id}">
                    <type multiplicity="${
                      elementoLink.atributos[1] ?? ''
                    }" aggregation="shared" containment="Unspecified" />
                  </target>
                  <properties ea_type="Aggregation" />
                  <labels lb="${elementoLink.atributos[0] ?? ''}" rb="${
                elementoLink.atributos[1] ?? ''
              }"/>
                  <extendedProperties />
                </connector>
              `;

              connectorsXML.push({
                id: elementoLink.id,
                origen: elementoLink.origen.id,
                destino: elementoLink.destino.id,
                destinoType: 'shared',
                properties: 'Aggregation',
                intermedia: '',
              });
            }

            if (elementoLink.destino.normal == 'DEPENDENCIA') {
              console.log('entro a generar un connector con dependencia');
              connectors += `
                <connector xmi:idref="${elementoLink.id}">
                  <source xmi:idref="${elementoLink.origen.id}">
                    <type multiplicity="${
                      elementoLink.atributos[0] ?? ''
                    }" aggregation="none" containment="Unspecified" />
                  </source>
                  <target  xmi:idref="${elementoLink.destino.id}">
                    <type multiplicity="${
                      elementoLink.atributos[1] ?? ''
                    }" aggregation="none" containment="Unspecified" />
                  </target>
                  <properties ea_type="Dependency" direction="Source -&gt; Destination"/>
                  <labels lb="${elementoLink.atributos[0] ?? ''}" rb="${
                elementoLink.atributos[1] ?? ''
              }"/>
                  <extendedProperties />
                </connector>
              `;

              connectorsXML.push({
                id: elementoLink.id,
                origen: elementoLink.origen.id,
                destino: elementoLink.destino.id,
                destinoType: 'none',
                properties: 'Dependency',
                intermedia: '',
              });
            }

            diagramElement.push(elementoLink.id);
          }
        }
        connectors += `</connectors>`;

        let elements: string = '<elements>';
        for (let elementoClase of elementosClases) {
          elements += `
        <element xmi:idref="${elementoClase.id}" xmi:type="uml:Class" name="${elementoClase.titulo}"
				scope="public">
        <attributes>
         `;
          for (let atributo of elementoClase.atributos) {
            elements += `
            <attribute xmi:idref="${atributo.id}" name="${atributo.titulo}" scope="Private">
						    <properties />
					  </attribute>
            `;
          }
          elements += `
          </attributes>
          <links>
          `;
          for (let connector of connectorsXML) {
            if (
              elementoClase.id == connector.origen &&
              connector.properties == 'Association' &&
              connector.destinoType == 'none' &&
              connector.intermedia == ''
            ) {
              elements += `
            <Association xmi:id="${connector.id}"
						start="${connector.origen}" end="${connector.destino}" />
              `;
            }

            if (
              elementoClase.id == connector.origen &&
              connector.properties == 'Association' &&
              connector.destinoType == 'none' &&
              connector.intermedia != ''
            ) {
              elements += `
            <Association xmi:id="${connector.id}"
						start="${connector.origen}" end="${connector.destino}" />
              `;
            }

            if (
              elementoClase.id == connector.destino &&
              connector.properties == 'Aggregation' &&
              connector.destinoType == 'shared' &&
              connector.intermedia == ''
            ) {
              elements += `
            <Aggregation xmi:id="${connector.id}"
						start="${connector.origen}" end="${connector.destino}" />
              `;
            }

            if (
              elementoClase.id == connector.destino &&
              connector.properties == 'Aggregation' &&
              connector.destinoType == 'composite' &&
              connector.intermedia == ''
            ) {
              elements += `
            <Aggregation xmi:id="${connector.id}"
						start="${connector.origen}" end="${connector.destino}" />
              `;
            }

            if (
              elementoClase.id == connector.destino &&
              connector.properties == 'Dependency' &&
              connector.destinoType == 'none' &&
              connector.intermedia == ''
            ) {
              console.log('entro crear link en elmentos para dependecia');
              elements += `
            <Dependency xmi:id="${connector.id}"
						start="${connector.origen}" end="${connector.destino}" />
              `;
            }
          }
          elements += `
          </links>
          </element>
          `;
        }
        elements += `
        </elements>
        `;

        let packagedElements: string = `<packagedElement xmi:type="uml:Package" xmi:id="carpetaPrincipal"
			name="Domain Objects">`;

        for (let elementoClase of elementosClases) {
          if (elementoClase.color == '#ffd628') {
            packagedElements += `<packagedElement xmi:type="uml:AssociationClass" xmi:id="${elementoClase.id}" name="${elementoClase.titulo}">`;
          } else {
            packagedElements += `<packagedElement xmi:type="uml:Class" xmi:id="${elementoClase.id}" name="${elementoClase.titulo}">`;
          }

          for (let atributo of elementoClase.atributos) {
            packagedElements += `
            <ownedAttribute xmi:type="uml:Property" xmi:id="${atributo.id}" name="${atributo.titulo}">
				    </ownedAttribute>
            `;
          }

          for (let connector of connectorsXML) {
            if (
              elementoClase.id == connector.origen &&
              connector.destinoType == 'none' &&
              connector.properties == 'Generalization' &&
              connector.intermedia == 'esG'
            ) {
              packagedElements += `
                <generalization xmi:type="uml:Generalization"
                xmi:id="${connector.id}"
                general="${connector.destino}" />
              `;
            }
          }
          packagedElements += `</packagedElement>`;
        }
        packagedElements += `
          </packagedElement>
        `;

        let antepenultimo = `
        <diagrams>
        <diagram xmi:id="EAID_BAE75F5F_1D59_47c7_BAFB_1AEA07247773">
				<model package="carpetaPrincipal" localID="40"
				owner="carpetaPrincipal" />
				<properties name="Domain Objects" type="Logical" />
				<extendedProperties />
				<elements>
        `;
        for (let elementoClase of elementosClases) {
          antepenultimo += `
            <element
            geometry="Left=${elementoClase.posicion[0]};
            Top=${elementoClase.size[0]};
            Right=${elementoClase.posicion[1]};
            Bottom=${elementoClase.size[1]};"
            subject="${elementoClase.id}"
					/>
          `;
        }
        for (let elementoLink of diagramElement) {
          // Verificar si el elementoLink ya está en linkOcupados
          // if (linkOcupados.some((link) => link.id === elementoLink.id)) {
          //   continue; // Saltar a la siguiente iteración si el link ya está ocupado
          // }
          antepenultimo += `
            <element
            subject="${elementoLink}"
                      /> `;
        }
        let final: string = `
				</elements>
			  </diagram>
		    </diagrams>
	      </xmi:Extension>
        </xmi:XMI>
        `;

        //   let etapa1Inicio = `
        //   <packagedElement xmi:type="uml:Package" xmi:id="carpetaPrincipal" name="System">
        //  `;

        // READ : EXTENSION XML
        let etapa2Inicio = `
        </uml:Model>
        <xmi:Extension extender="Enterprise Architect" extenderID="6.5">`;

        cabezaXML +=
          // etapa1Inicio +
          packagedElements +
          etapa2Inicio +
          elements +
          connectors +
          antepenultimo +
          final;

        // Generar un UUID de 6 caracteres
        const uuid = uuidv4().slice(0, 6);

        // Nombre del archivo
        const fileName = `${uuid}.xml`;

        // Crear un blob con el contenido XML
        const blob = new Blob([cabezaXML], { type: 'application/xml' });

        // Crear un enlace de descarga
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;

        // Simular un clic en el enlace para iniciar la descarga
        link.click();

        // Liberar el objeto URL
        URL.revokeObjectURL(link.href);
      },
      'xmlExportar:pointerclick': () => {
        const entrada = document.createElement('input');
        entrada.type = 'file';
        entrada.accept = '.xml';
        entrada.onchange = (event: any) => {
          const archivo = event.target.files[0];
          if (archivo) {
            const lector = new FileReader();
            lector.onload = (e) => {
              try {
                const xmlContent = e.target!.result as string;

                // Parsear el contenido del XML
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(
                  xmlContent,
                  'application/xml'
                );

                // LOGIC : ACCEDER <element> con xmi:type="uml:Class"
                // LOGIC : ACCEDER <element> aqui van los datos de coordenadas en el papel
                const packagedElements = xmlDoc.getElementsByTagName('element');
                let clasesJoint: Element[] = [];
                let dataClasesJoint: Element[] = [];

                for (let i = 0; i < packagedElements.length; i++) {
                  const element = packagedElements[i];
                  // Verificar si el atributo 'xmi:idref' existe
                  if (element.hasAttribute('xmi:idref')) {
                    clasesJoint.push(element);
                  }
                  // Verificar si el atributo 'geometry' existe
                  if (element.hasAttribute('geometry')) {
                    dataClasesJoint.push(element);
                  }
                }

                function getGeometryValues(id: string): string[] {
                  for (let i = 0; i < dataClasesJoint.length; i++) {
                    const element = dataClasesJoint[i];
                    const subject = element.getAttribute('subject');

                    if (subject == id) {
                      const geometry = element.getAttribute('geometry');
                      if (geometry) {
                        // Extraer los valores numéricos de geometry
                        const values = geometry.match(/\d+/g);
                        if (values) {
                          return values;
                        }
                      }
                    }
                  }
                  return [];
                }

                // LOGIC : ACCEDER <connector>
                const connectors = xmlDoc.getElementsByTagName('connector');

                let clasesJsonToJoint: string[] = [];
                // READ : CREAR LAS Clases Normales e intermedias
                clasesJoint.forEach((element, index) => {
                  const id = element.getAttribute('xmi:idref');
                  const nombre = element.getAttribute('name');
                  let color = nombre?.includes('_') ? '#ffd628' : '#24d46d';
                  let coordenadas: string[] = getGeometryValues(id!);

                  // LOGIC: Lista para almacenar los resultados
                  let attributeList = '';
                  const attributes = element.getElementsByTagName('attribute');
                  for (let j = 0; j < attributes.length; j++) {
                    const attribute = attributes[j];
                    const name = attribute.getAttribute('name');
                    const properties =
                      attribute.getElementsByTagName('properties')[0];
                    const type = properties
                      ? properties.getAttribute('type')
                      : '';
                    if (name && type) {
                      attributeList += `-${name}:${type}\\n`;
                    }
                  }

                  clasesJsonToJoint.push(`
          {
    "type": "standard.HeaderedRectangle",
    "position": {
      "x": ${coordenadas[0]},
      "y": ${coordenadas[1]}
    },
    "size": {
      "width": 200,
      "height": 100
    },
    "angle": 0,
    "id": "${id}",
    "z": 1,
    "attrs": {
      "root": {
        "dataTooltipPosition": "left",
        "dataTooltipPositionSelector": ".joint-stencil"
      },
      "body": {
        "stroke": "${color}",
        "fill": "transparent",
        "strokeDasharray": "0"
      },
      "header": {
        "height": 20,
        "stroke": "${color}",
        "fill": "${color}",
        "strokeDasharray": "0"
      },
      "headerText": {
        "y": 10,
        "fontSize": 11,
        "fill": "#000000",
        "text": "Cliente",
        "fontFamily": "Averia Libre",
        "fontWeight": "Bold",
        "strokeWidth": 0
      },
      "bodyText": {
        "y": "calc(h/2 + 10)",
        "fontSize": 11,
        "fill": "#FFFFFF",
        "textWrap": {
          "text": "${attributeList}",
          "width": -10,
          "height": -20,
          "ellipsis": true
        },
        "fontFamily": "Averia Libre",
        "fontWeight": "Bold",
        "strokeWidth": 0
      }
    }
  }`);
                });

                let linksJsonToJoint: string[] = [];
                for (let i = 0; i < connectors.length; i++) {
                  const connector = connectors[i];
                  let sourceId = '';
                  let sourceMultiplicity = '';
                  let targetMultiplicity = '';
                  let targetId = '';
                  let eaType = '';
                  let subtype = '';
                  let intermediaId = '';
                  // Obtener el atributo xmi:idref del connector
                  const connectorId = connector.getAttribute('xmi:idref');
                  console.log('Connector ID:', connectorId);

                  // Obtener el elemento source y su atributo xmi:idref
                  const source = connector.getElementsByTagName('source')[0];
                  if (source) {
                    sourceId = source.getAttribute('xmi:idref')!;
                    console.log('Source ID:', sourceId);

                    // Obtener el elemento type dentro de source y su atributo multiplicity
                    const sourceType = source.getElementsByTagName('type')[0];
                    if (sourceType) {
                      sourceMultiplicity =
                        sourceType.getAttribute('multiplicity')!;
                      console.log('Source Multiplicity:', sourceMultiplicity);
                    }
                  }

                  // Obtener el elemento target y su atributo xmi:idref
                  const target = connector.getElementsByTagName('target')[0];
                  if (target) {
                    targetId = target.getAttribute('xmi:idref')!;
                    console.log('Target ID:', targetId);

                    // Obtener el elemento type dentro de target y su atributo multiplicity
                    const targetType = target.getElementsByTagName('type')[0];
                    if (targetType) {
                      targetMultiplicity =
                        targetType.getAttribute('multiplicity')!;
                      console.log('Target Multiplicity:', targetMultiplicity);
                    }
                  }

                  // Obtener el elemento properties y su atributo ea_type
                  const properties =
                    connector.getElementsByTagName('properties')[0];
                  if (properties) {
                    eaType = properties.getAttribute('ea_type')!;
                    subtype = properties.getAttribute('subtype') ?? '';
                  }

                  const extendedProperties =
                    connector.getElementsByTagName('extendedProperties')[0];
                  if (extendedProperties) {
                    intermediaId =
                      extendedProperties.getAttribute('associationclass') ?? '';
                  }
                  const uuid1 = uuidv4();
                  const uuid2 = uuidv4();
                  if (
                    sourceMultiplicity.includes('*') &&
                    targetMultiplicity.includes('*')
                  ) {
                    linksJsonToJoint.push(`
                      {
      "type": "app.Link",
      "router": {
        "name": "normal"
      },
      "connector": {
        "name": "rounded"
      },
      "labels": [
        {
          "attrs": {
            "text": {
              "text": "${sourceMultiplicity}",
              "fill": null
            }
          }
        }
      ],
      "source": {
        "id": "${sourceId}"
      },
      "target": {
        "id": "${intermediaId}"
      },
      "id": "${uuid1}",
      "z": 12,
      "attrs": {}
    }`);

                    linksJsonToJoint.push(`
      {
"type": "app.Link",
"router": {
"name": "normal"
},
"connector": {
"name": "rounded"
},
"labels": [
{
"attrs": {
"text": {
"text": "${targetMultiplicity}",
"fill": null
}
}
}
],
"source": {
"id": "${targetId}"
},
"target": {
"id": "${intermediaId}"
},
"id": "${uuid2}",
"z": 12,
"attrs": {}
}`);
                  } else {
                    let d: string = '';
                    if (eaType == 'Association' && subtype == '') {
                      d = this.tipoCabeceraInversa('ASOCIACION');
                    }
                    if (eaType == 'Generalization' && subtype == '') {
                      d = this.tipoCabeceraInversa('HERENCIA');
                    }
                    if (eaType == 'Aggregation' && subtype == 'Strong') {
                      d = this.tipoCabeceraInversa('COMPOSICION');
                    }
                    if (eaType == 'Aggregation' && subtype == 'Weak') {
                      d = this.tipoCabeceraInversa('AGREGACION');
                    }
                    if (eaType == 'Dependency' && subtype == '') {
                      d = this.tipoCabeceraInversa('DEPENDENCIA');
                    }

                    linksJsonToJoint.push(`
     {
"type": "app.Link",
"router": {
"name": "normal"
},
"connector": {
"name": "rounded"
},
"labels": [
${
  sourceMultiplicity
    ? `
{
"attrs": {
"text": {
"text": "${sourceMultiplicity}",
"fill": null
}
},
"position": {
"distance": 0.2,
"offset": 0,
"angle": 0
}
},
`
    : ''
}
${
  targetMultiplicity
    ? `
{
"attrs": {
"text": {
"text": "${targetMultiplicity}",
"fill": null
}
},
"position": {
"distance": 0.8,
"offset": 0,
"angle": 0
}
}
`
    : ''
}
],
"source": {
"id": "${sourceId}"
},
"target": {
"id": "${targetId}"
},
"id": "${connectorId}",
"z": 17,
"vertices": [],
"attrs": {
"line": {
"targetMarker": {
"d": "${d}",
"fill": "#ffd628"
}
}
}
}`);
                  }
                }

                // READ : GENERAR EL JSON
                const jsonJoint = `
                  {
                    "cells": [
                      ${clasesJsonToJoint.join(',')},
                      ${linksJsonToJoint.join(',')}
                    ]
                  }
                `;
                console.log(jsonJoint);
                this.graph.fromJSON(JSON.parse(jsonJoint));
              } catch (error) {
                console.error('Error al leer el archivo XML:', error);
              }
            };
            lector.readAsText(archivo);
          }
        };
        entrada.click();
      },
    });

    this.renderPlugin('.toolbar-container', this.toolbarService.toolbar);
  }

  tipoCabeceraInversa(descripcion: string): string {
    const mapaInverso: { [key: string]: string } = {
      ASOCIACION: 'M 0 0 0 0',
      COMPOSICION: 'M -10 0 0 10 10 0 0 -10 z',
      AGREGACION: 'M 0 -10 15 0 0 10 z',
      HERENCIA: 'M 0 -10 -15 0 0 10 z',
      DEPENDENCIA:
        'M 0 -10 L 2.94 -3.09 L 9.51 -3.09 L 4.29 1.18 L 6.18 8.09 L 0 5 L -6.18 8.09 L -4.29 1.18 L -9.51 -3.09 L -2.94 -3.09 Z',
    };

    return mapaInverso[descripcion] || 'M 0 0 0 0';
  }

  generarServicio(nombreClase: string, jpaClass: ClassJPA): string {
    const parsearAtributos = (jpaClass: string) => {
      const simples: string[] = [];
      const lines = jpaClass.split('\n');

      for (let line of lines) {
        line = line.trim();

        if (
          line.startsWith('private') &&
          !line.includes('id') &&
          (line.includes('String') ||
            line.includes('Long') ||
            line.includes('int') ||
            line.includes('boolean') ||
            line.includes('LocalDate') ||
            line.includes('BigDecimal') ||
            line.includes('Date') ||
            line.includes('Time') ||
            line.includes('Timestamp') ||
            line.includes('LocalDateTime') ||
            line.includes('LocalTime') ||
            line.includes('Double') ||
            line.includes('Float'))
        ) {
          const parts = line.split(' ');
          const nombre = parts[2].replace(';', '');
          simples.push(nombre.charAt(0).toUpperCase() + nombre.slice(1));
        }
      }

      return { simples };
    };

    const { simples } = parsearAtributos(jpaClass.contenido);

    return `package com.example.parcial1sw1.servicios;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.example.parcial1sw1.modelos.${nombreClase};
import com.example.parcial1sw1.repositorios.${nombreClase}Repositorio;

import java.util.List;
import java.util.Optional;

@Service
public class ${nombreClase}Servicio {

    @Autowired
    private ${nombreClase}Repositorio repositorio;

    public List<${nombreClase}> listar() {
        return repositorio.findAll();
    }

    public ${nombreClase} obtenerPorId(Long id) {
        return repositorio.findById(id).orElse(null);
    }

    @Transactional
    public String guardar(${nombreClase} ${nombreClase.toLowerCase()}) {
        try {
            repositorio.save(${nombreClase.toLowerCase()});
            return "${nombreClase} guardado con éxito.";
        } catch (Exception e) {
            // Manejar la excepción y retornar un mensaje de error
            return "Error al guardar ${nombreClase}: " + e.getMessage();
        }
    }

    @Transactional
    public String actualizar(Long id, ${nombreClase} ${nombreClase.toLowerCase()}) {
        if (repositorio.existsById(id)) {
            Optional<${nombreClase}> optionalObjetoExistente = repositorio.findById(id);

            if (optionalObjetoExistente.isPresent()) {
                ${nombreClase} objetoExistente = optionalObjetoExistente.get();
                // Actualizar atributos simples
                ${simples
                  .map(
                    (attr) =>
                      `objetoExistente.set${
                        attr.charAt(0).toUpperCase() + attr.slice(1)
                      }(${nombreClase.toLowerCase()}.get${
                        attr.charAt(0).toUpperCase() + attr.slice(1)
                      }());`
                  )
                  .join('\n                ')}

                // Actualizar relaciones ManyToOne
                // Actualizar relaciones OneToOne
                // Actualizar relaciones ManyToMany
                // Actualizar relaciones OneToMany
                ${jpaClass.attrsEspeciales
                  .map(
                    (attr) =>
                      `objetoExistente.set${
                        attr.charAt(0).toUpperCase() + attr.slice(1)
                      }(${nombreClase.toLowerCase()}.get${
                        attr.charAt(0).toUpperCase() + attr.slice(1)
                      }());`
                  )
                  .join('\n                ')}

                repositorio.save(objetoExistente);
                return "${nombreClase} actualizado con éxito.";
            } else {
                return "${nombreClase} no encontrado.";
            }
        } else {
            return "${nombreClase} no encontrado.";
        }
    }

    @Transactional
    public String eliminar(Long id) {
        if (repositorio.existsById(id)) {
            try {
                repositorio.deleteById(id);
                return "${nombreClase} eliminado con éxito.";
            } catch (Exception e) {
                // Manejar la excepción y retornar un mensaje de error
                return "Error al eliminar ${nombreClase}: " + e.getMessage();
            }
        } else {
            return "${nombreClase} no encontrado.";
        }
    }
}
`;
  }

  // Generar controlador
  generarControlador(nombreClase: string): string {
    return `package com.example.parcial1sw1.controladores;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.example.parcial1sw1.modelos.${nombreClase};
import com.example.parcial1sw1.servicios.${nombreClase}Servicio;

import java.util.List;

@RestController
@RequestMapping("/${nombreClase.toLowerCase()}")
public class ${nombreClase}Controlador {

@Autowired
private ${nombreClase}Servicio servicio;

@GetMapping
public List<${nombreClase}> listar() {
    return servicio.listar();
}

@GetMapping("/{id}")
public ResponseEntity<${nombreClase}> obtenerPorId(@PathVariable Long id) {
    ${nombreClase} ${nombreClase.toLowerCase()} = servicio.obtenerPorId(id);
    return ${nombreClase.toLowerCase()} != null ? ResponseEntity.ok(${nombreClase.toLowerCase()}) : ResponseEntity.notFound().build();
}

@PostMapping
public ResponseEntity<String> guardar(@RequestBody ${nombreClase} ${nombreClase.toLowerCase()}) {
    String respuesta = servicio.guardar(${nombreClase.toLowerCase()});
    return ResponseEntity.ok(respuesta);
}

@PutMapping("/{id}")
public ResponseEntity<String> actualizar(@PathVariable Long id, @RequestBody ${nombreClase} ${nombreClase.toLowerCase()}) {
    String respuesta = servicio.actualizar(id, ${nombreClase.toLowerCase()});
    return ResponseEntity.ok(respuesta);
}

@DeleteMapping("/{id}")
public ResponseEntity<String> eliminar(@PathVariable Long id) {
    String respuesta = servicio.eliminar(id);
    return ResponseEntity.ok(respuesta);
}
}
`;
  }

  // Generar repositorio
  generarRepositorio(nombreClase: string): string {
    return `package com.example.parcial1sw1.repositorios;

import org.springframework.data.jpa.repository.JpaRepository;
import com.example.parcial1sw1.modelos.${nombreClase};

public interface ${nombreClase}Repositorio extends JpaRepository<${nombreClase}, Long> {
}
`;
  }

  // Método para extraer el nombre de la clase JPA
  extraerNombreClase(claseJPA: string): string {
    const nombreClaseRegex = /public class (\w+)/;
    const resultado = claseJPA.match(nombreClaseRegex);
    return resultado ? resultado[1] : 'ClaseDesconocida';
  }

  capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  relacionesClaseJPA(
    elementoClase1: ElementoClase,
    link: ElementoLink,
    elementoClase2: ElementoClase,
    posicion: string,
    ticketsOneToOne: TicketOneToOne[],
    atributosEspeciales: string[]
  ): [string, TicketOneToOne[], string[]] {
    let respuesta: string = '';
    const cardinalidad: string =
      posicion == 'origen' ? link.atributos[1] : link.atributos[0];

    if (
      (link.atributos[0] == '0...1' && link.atributos[1] == '0...1') ||
      (link.atributos[0] == '1...1' && link.atributos[1] == '1...1') ||
      (link.atributos[0] == '0...1' && link.atributos[1] == '1...1') ||
      (link.atributos[0] == '1...1' && link.atributos[1] == '0...1')
    ) {
      // LOGIC : DEBE CUMPLIR ESTA CARDINALIDAD PARA OneToOne
      // LOGIC : VERIFICA SI SE ENCUENTRA O EXISTE
      if (!ticketsOneToOne.some((ticket) => ticket.linkOneToOne == link)) {
        if (link.origen.id == elementoClase1.id) {
          // LOGIC : CUANDO LA CLASE JPA CONTRUCCION ESTA EN EL ORIGEN
          let cardinalidaBase: string = link.atributos[1];
          respuesta = `
          @OneToOne(cascade = CascadeType.ALL)
          @JoinColumn(name = "id_${elementoClase2.titulo.toLowerCase()}", nullable = ${
            cardinalidaBase.includes('0') ? 'true' : 'false'
          })
          private ${
            elementoClase2.titulo
          } ${elementoClase2.titulo.toLowerCase()};`;
          let ticketOneToOne: TicketOneToOne = {
            linkOneToOne: link,
            origenStatus: 1,
            destinoStatus: 0,
          };
          ticketsOneToOne.push(ticketOneToOne);
          atributosEspeciales.push(
            this.capitalizeFirstLetter(elementoClase2.titulo.toLowerCase())
          );
          return [respuesta, ticketsOneToOne, atributosEspeciales];
        } else {
          // LOGIC : CUANDO LA CLASE JPA CONTRUCCION ESTA EN EL DESTINO
          let cardinalidaBase: string = link.atributos[0];
          respuesta = `
          @OneToOne(mappedBy = "${elementoClase1.titulo.toLowerCase()}" ${
            cardinalidaBase.includes('0') ? ', optional = true' : ''
          })
          private ${
            elementoClase2.titulo
          } ${elementoClase2.titulo.toLowerCase()};`;
          let ticketOneToOne: TicketOneToOne = {
            linkOneToOne: link,
            origenStatus: 0,
            destinoStatus: 1,
          };
          ticketsOneToOne.push(ticketOneToOne);
          atributosEspeciales.push(
            this.capitalizeFirstLetter(elementoClase2.titulo.toLowerCase())
          );
          return [respuesta, ticketsOneToOne, atributosEspeciales];
        }
      } else {
        // LOGIC : PRIMERO VA VERIFICAR SI TICKET ES VALIDO PARA OneToOne VERIFICA SI CUMPLIO SU CICLO
        let ticketTrabajo: TicketOneToOne = ticketsOneToOne.find(
          (ticket) => ticket.linkOneToOne == link
        )!;
        let index = ticketsOneToOne.findIndex(
          (ticket) => ticket.linkOneToOne == link
        );
        if (
          ticketTrabajo.origenStatus == 1 &&
          ticketTrabajo.destinoStatus == 1
        ) {
          return [respuesta, ticketsOneToOne, atributosEspeciales];
        }

        // LOGIC : SI ESTA EN LA LISTA PERO FALTA TRABAJARLO
        if (ticketTrabajo.linkOneToOne.origen.id == elementoClase1.id) {
          let cardinalidaBase: string = link.atributos[1];
          respuesta = `
          @OneToOne(cascade = CascadeType.ALL)
          @JoinColumn(name = "id_${elementoClase2.titulo.toLowerCase()}", nullable = ${
            cardinalidaBase.includes('0') ? 'true' : 'false'
          })
          private ${
            elementoClase2.titulo
          } ${elementoClase2.titulo.toLowerCase()};`;
          ticketsOneToOne[index] = {
            ...ticketsOneToOne[index],
            origenStatus: 1,
          };
          atributosEspeciales.push(
            this.capitalizeFirstLetter(elementoClase2.titulo.toLowerCase())
          );
          return [respuesta, ticketsOneToOne, atributosEspeciales];
        } else {
          let cardinalidaBase: string = link.atributos[0];
          // LOGIC : CUANDO LA CLASE JPA CONTRUCCION ESTA EN EL DESTINO
          respuesta = `
          @OneToOne(mappedBy = "${elementoClase1.titulo.toLowerCase()}" ${
            cardinalidaBase.includes('0') ? ', optional = true' : ''
          })
          private ${
            elementoClase2.titulo
          } ${elementoClase2.titulo.toLowerCase()};`;
          ticketsOneToOne[index] = {
            ...ticketsOneToOne[index],
            destinoStatus: 1,
          };
          atributosEspeciales.push(
            this.capitalizeFirstLetter(elementoClase2.titulo.toLowerCase())
          );
          return [respuesta, ticketsOneToOne, atributosEspeciales];
        }
      }
    }

    if (
      cardinalidad == '0...1' ||
      cardinalidad == '1...1' ||
      cardinalidad == '1...0'
    ) {
      respuesta = `
      @ManyToOne
      @JoinColumn(name = "id_${elementoClase2.titulo.toLowerCase()}", nullable = ${
        cardinalidad.includes('0') ? 'true' : 'false'
      })
      private ${elementoClase2.titulo} ${elementoClase2.titulo.toLowerCase()};`;
      atributosEspeciales.push(
        this.capitalizeFirstLetter(elementoClase2.titulo.toLowerCase())
      );
      return [respuesta, ticketsOneToOne, atributosEspeciales];
    }

    if (
      cardinalidad == '0...*' ||
      cardinalidad == '1...*' ||
      cardinalidad == '*...0' ||
      cardinalidad == '*...1'
    ) {
      respuesta = `
      @OneToMany(mappedBy = "${elementoClase1.titulo.toLowerCase()}")
      private List<${elementoClase2.titulo}> ${pluralize(
        elementoClase2.titulo.toLowerCase()
      )};`;
      atributosEspeciales.push(
        this.capitalizeFirstLetter(
          pluralize(elementoClase2.titulo.toLowerCase())
        )
      );
      return [respuesta, ticketsOneToOne, atributosEspeciales];
    }
    return [respuesta, ticketsOneToOne, atributosEspeciales];
  }

  parsearAtributo(atributo: string): AtributosSB {
    const [nombre, tipoPostgres] = atributo.trim().split(':');
    const tipoJava = this.convertirTipoPostgresATipoJava(tipoPostgres);
    return new AtributosSB(nombre, tipoJava);
  }

  convertirTipoPostgresATipoJava(tipoPostgres: string): string {
    const mapeoTipos: { [key: string]: string } = {
      integer: 'Long',
      serial: 'Long',
      bigint: 'Long',
      smallint: 'Long',
      numeric: 'BigDecimal',
      decimal: 'BigDecimal',
      double: 'double',
      real: 'Float',
      char: 'String',
      varchar: 'String',
      text: 'String',
      boolean: 'Boolean',
      date: 'LocalDate',
      timestamp: 'LocalDateTime',
    };
    return mapeoTipos[tipoPostgres] || 'String';
  }

  encontrarClaseTrabajo(
    tipo: string,
    elementoLink: ElementoLink,
    elementosClases: ElementoClase[]
  ): ElementoClase {
    for (let clase of elementosClases) {
      if (tipo == 'origen' && clase.id == elementoLink.destino.id) {
        return clase;
      } else if (tipo == 'destino' && clase.id == elementoLink.origen.id) {
        return clase;
      }
    }
    // Si no se encuentra la clase, devolver el primer elemento como fallback
    return elementosClases[0];
  }

  applyOnSelection(method: string) {
    this.graph.startBatch('selection');
    this.selection.collection.models.forEach(function (model: joint.dia.Cell) {
      (model as any)[method]();
    });
    this.graph.stopBatch('selection');
  }

  changeSnapLines(checked: boolean) {
    if (checked) {
      this.snaplines.enable();
    } else {
      this.snaplines.disable();
    }
  }

  initializeKeyboardShortcuts() {
    this.keyboardService.create(
      this.graph,
      this.clipboard,
      this.selection,
      this.paperScroller,
      this.commandManager
    );
  }

  initializeTooltips(): joint.ui.Tooltip {
    return new joint.ui.Tooltip({
      rootTarget: document.body,
      target: '[data-tooltip]',
      direction: joint.ui.Tooltip.TooltipArrowPosition.Auto,
      padding: 10,
    });
  }

  openAsSVG() {
    this.paper.hideTools();
    joint.format.toSVG(
      this.paper,
      (svg: string) => {
        new joint.ui.Lightbox({
          image: 'data:image/svg+xml,' + encodeURIComponent(svg),
          downloadable: true,
          fileName: 'Rappid',
        }).open();
        this.paper.showTools();
      },
      {
        preserveDimensions: true,
        convertImagesToDataUris: true,
        useComputedStyles: false,
        grid: true,
      }
    );
  }

  openAsPNG() {
    this.paper.hideTools();
    joint.format.toPNG(
      this.paper,
      (dataURL: string) => {
        new joint.ui.Lightbox({
          image: dataURL,
          downloadable: true,
          fileName: 'Rappid',
        }).open();
        this.paper.showTools();
      },
      {
        padding: 10,
        useComputedStyles: false,
        grid: true,
      }
    );
  }

  layoutDirectedGraph() {
    DirectedGraph.layout(this.graph, {
      setVertices: true,
      rankDir: 'TB',
      marginX: 100,
      marginY: 100,
    });

    this.paperScroller.centerContent({ useModelGeometry: true });
  }

  renderPlugin(selector: string, plugin: any): void {
    this.el.querySelector(selector)!.appendChild(plugin.el);
    plugin.render();
  }
}

export default KitchenSinkService;
