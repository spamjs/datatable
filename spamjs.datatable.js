define({
    name: "spamjs.datatable",
    extend: "spamjs.view",
    modules: ["jsutils.server", "jQuery", "jsutils.file", "jsutils.tmpl"]
}).as(function(dataTableLoader, utilServer, jq, jsfile, tmplUtil) {
    return {
        events: {
            "click .datatable-row": "datatableRowClick",
            "change .grid-actions": "gridActionSelected",
            "change .datatable-row input[type='checkbox']": "rowSelectionChanged",
            "click input[type='checkbox'].select-all": "selectAllRows"
        },
        // override this in your project to provide custom server
        getServer: function() {
            return utilServer;
        },
        // override this in your project to get i18n for titles
        i18n: function(data) {
            return data;
        },
        _init_: function(config) {
            var self = this;
            self.rowsSelected = [];
            var tableConfig = {
                data: [],
                columns: [],
                columnDefs: [],
                global: {},
                scrollY: "200px",
                dom: "Rfrtlip",
                // for show/hide "Available Actions" in the grid actions
                showActionTitle: true,
                info: false,
                pathParams: {},
                scrollX: true,
                defaultColumnWidth: "160px",
                actionsList: [],
                // showCheckbox && rowReorder are not supported together
                showCheckbox: false,
                rowReorder: false,
                dataFormatter: function(data) {
                    return data;
                },
                createdRow: function (row, data, index) {
                    jq(row).addClass("datatable-row");
                },
                // required as self.gridInstance.draw() does not return a promise
                drawCallback: function() {
                    self.trigger("grid-draw-completed");
                },
                correctPaginationData: function(paginateOptions) { return paginateOptions;},
                initComplete: function() { 
                    if(!self.resizeDatatable) {
                        self.resizeDatatable = self.getResize();
                    }
                    self.resizeDatatable();
                    if(self.tableConfig.paginate) {
                        self.$$.find("#gridContainer_wrapper").addClass("paginated-grid");
                    }
                    self.$$.find("#gridContainer_wrapper").animate({opacity: 1});
                    self.trigger("grid-init-complete");
                },
                // need to trigger a event on row selection change
                actionsFormatter: self.actionsFormatter
            };
            self.tableConfig = jq.extend(tableConfig, config);
            return jsfile.getXML(config.configSrc).then(function(resp) {
                self.$$.append('<table id="gridContainer"></table>');
                self.gridContainer = self.$$.find("#datatableContainer");
                self.jqfile = jq(resp);
                self.generateTableConfig();
                // This way we will override everything in JS code
                self.tableConfig = jq.extend(self.tableConfig, config);
                self.configureAjax();
                self.generateColumnsConfig();
                self.generateActionsConfig();
                self.gridElement = self.$$.find("#gridContainer");
                return jq.when(self.getGridData()).done(function() {
                    self.gridInstance = self.gridElement.DataTable(self.tableConfig);
                    self.bindExternalSearch();
                    self.bindRowReorder();
                    // configuring rendering of grid on resizing
                    jq(window).resize(function() {
                        self.resizeDatatable();
                    });
                    if (self.tableConfig.showCheckbox) {
                        self.$$.find(".dataTables_scroll").addClass("checkbox-enabled");
                    }
                    if (self.tableConfig.rowReorder) {
                        self.$$.find(".dataTables_scroll").addClass("reorder-enabled");
                    }
                    self.configureGridActions();
                }).always(function() {
                    self.$$.find("spinner").remove();
                });
            });
        },
        // fetches data only in case of client side grid
        getGridData: function() {
            var self = this;
            if (!self.tableConfig.url) {
                return self.tableConfig.data;
            }
            if (!self.tableConfig.serverSide) {
                var paginateOptions = self.tableConfig.correctPaginationData({});
                self.$$.append("<spinner mid-spinner></spinner>");
                return self.getServer().get(
                    self.tableConfig.url,
                    paginateOptions,
                    self.tableConfig.pathParams
                ).done(function(resp) {
                    self.tableConfig.data = resp;
                });
            }
        },
        configureGridActions: function() {
            var self = this;
            var actionsList = self.tableConfig.actionsList;
            self.$$.find(".dataTables_scrollHead").append('<select class="grid-actions"></select>');
            if (actionsList.length) {
                if(self.tableConfig.showActionTitle) {
                    self.$$.find(".grid-actions").append('<option selected="selected" disabled="disabled" value="">Available Actions</option>');
                } else {
                    self.$$.find(".grid-actions").append('<option selected="selected" disabled="disabled" value="">'+actionsList[0].key+'</option>');
                }
                _.each(actionsList, function(item, index) {
                    if(self.tableConfig.showActionTitle || index !== 0) {
                        self.$$.find(".grid-actions").append(
                            '<option '+ (item.disabled ? 'disabled': '') +' value="' + item.key + '">' + item.key + '</option>'
                        );
                    }
                });
            }
            self.$$.find(".grid-actions").hide();
        },
        bindExternalSearch: function() {
            var self = this;
            if (self.tableConfig.searchElement) {
                self.tableConfig.searchElement.keyup(function(e, element) {
                    self.gridInstance.search(jq(element).val()).draw();
                });
            }
        },
        bindRowReorder: function() {
            var self = this;
            if (self.tableConfig.rowReorder) {
                self.gridInstance.on('row-reorder', function(e, diff, edit) {
                    var reorderedData = [], originalData = self.getData();
                    _.each(diff, function(row) {
                        reorderedData[row.newPosition] = originalData[row.oldPosition];
                    });
                    _.each(originalData, function(row, index) {
                        if (!reorderedData[index]) {
                            reorderedData[index] = row;
                        }
                    });
                    self.trigger("row-reorder", {
                        original: originalData,
                        reorderedData: reorderedData,
                        edit: edit
                    });
                });
            }
        },
        gridActionSelected: function(e, element) {
            var self = this;
            self.trigger("grid-action-selected", {
                option: jq(element).val(),
                rows: self.rowsSelected
            });
            jq(element).val("");
        },
        actionsFormatter: function(rows) {
            var self = this;
            if (self.tableConfig.actionsList.length) {
                self.$$.find(".grid-actions").css("display",
                    rows.length ? "block": "none"
                );
            }
        },
        generateActionsConfig: function() {
            var self = this;
            // compiling the action nodes using the data from the config
            var actionNodes = self.jqfile.find("#actions");
            if(actionNodes.length) {
                var actionNodesContent = tmplUtil.compile(actionNodes[0].outerHTML, {
                    variable : ""
                })({
                    glob: self.tableConfig.global
                });
                var actions = jq(actionNodesContent).children();
                _.each(actions, function(element) {
                    self.tableConfig.actionsList.push({
                        disabled: element.getAttribute("disabled"),
                        key: element.innerHTML
                    });
                });
            }
        },
        generateTableConfig: function() {
            var self = this;
            self.tableConfig = jq.extend(self.tableConfig, self.jqfile.find("#config").data());
            self.tableConfig = jq.extend(self.tableConfig, self.jqfile.find("#pagination").data());
            self.tableConfig = jq.extend(self.tableConfig, self.jqfile.find("#ajax").data());
            // pagination: 50 & header: 40
            self.tableConfig.scrollY = this.$$.parent().height() - 40 - (this.tableConfig.paginate * 50);
        },
        configureAjax: function() {
            var self = this;
            // configure ajax
            if (self.tableConfig.serverSide) {
                self.tableConfig.ajax = function(data, callback, settings) {
                    if(!self.resizeDatatable) {
                        self.resizeDatatable = self.getResize();
                    }
                    self.resizeDatatable();
                    self.rowsSelected = [];
                    return self.configurePagination.apply(self, arguments);
                }
            }
        },
        generateColumnsConfig: function() {
            var self = this;
            var columns = self.jqfile.find("col");
            var checkboxColumn = self.jqfile.find("checkbox-col");
            if(self.tableConfig.rowReorder) {
                self.tableConfig.columns.push({
                    type: "html",
                    title: '&nbsp;',
                    className: "dt-head-center reorder-col",
                    orderable: false,
                    render: function(data, type, full, meta) {
                        return '<span grab><i class="icon icon_vertical_dots"></i></span>';
                    }
                });
            }
            if(self.tableConfig.showCheckbox) {
                // if dummy template for the checkbox column is available
                if(checkboxColumn.length) {
                    self.checkboxConfig = {
                        title: self.i18n(jq(checkboxColumn).find("title").html()) || "&nbsp;",
                        className: jq(checkboxColumn).attr("class") || "dt-head-center checkbox-col",
                        html: jq(checkboxColumn).find("row").html()
                    };
                }
                self.tableConfig.columns.push(jq.extend({
                    type: "html",
                    title: '<input type="checkbox" class="select-all" />',
                    className: "dt-head-center checkbox-col",
                    orderable: false,
                    html: '<input type="checkbox" class="row-checkbox"/>'
                }, self.checkboxConfig));
                // +self.tableConfig.rowReorder will give 1 in case of row-reordering enabled
                self.tableConfig.columns[+self.tableConfig.rowReorder].render = function(data, type, full, meta) {
                    return tmplUtil.compile(self.tableConfig.columns[+self.tableConfig.rowReorder].html, {
                        variable : ""
                    })({
                        data: full, 
                        glob: self.tableConfig.global
                    });
                };
            }
            for(var i = 0; i < columns.length; i++) {
                // cloning the element to compile the header otherwise it overwrites the original element
                var clone = jq(columns[i]).clone().html("");
                var compiledElement = jq(tmplUtil.compile(clone[0].outerHTML, {
                    variable : ""
                })({
                    glob: self.tableConfig.global
                }))[0];
                self.tableConfig.columns.push({
                    type: "html",
                    key: columns[i].getAttribute("key"),
                    // as getAttribute returns a string and not a boolean
                    visible: compiledElement.hasAttribute("hidden") ? compiledElement.getAttribute("hidden") === "false" : true,
                    title: self.i18n(columns[i].getAttribute("title")) || "&nbsp;",
                    className: columns[i].getAttribute("class") || "dt-head-left",
                    orderable: !!columns[i].getAttribute("sort"),
                    width: columns[i].getAttribute("width") || self.tableConfig.defaultColumnWidth,
                    render: (function(index) {
                        var compile = tmplUtil.compile(columns[index].innerHTML,{ variable : ""});
                        return function(data, type, full, meta) {
                            return compile({data: full, glob: self.tableConfig.global}).trim() || "-";
                        }
                    })(i)
                });
                if(columns[i].getAttribute("presort")) {
                    self.tableConfig.order = [
                        [
                            i + (+self.tableConfig.showCheckbox) + (+self.tableConfig.rowReorder),
                            columns[i].getAttribute("presort-direction") || "asc"
                        ]
                    ]
                }
            }
        },
        configurePagination: function(data, callback) {
            var self = this;
            var paginateOptions = {
                pageNumber: (data.start / data.length + 1),
                pageSize: data.length
            };
            if (data.order.length) {
                // FYI: Current datatable supports either row reodering or checkbox
                var orderIndex = data.order[0].column;
                paginateOptions.orderBy = self.tableConfig.columns[orderIndex].key;
                paginateOptions.sortAscending = (data.order[0].dir === "asc");
            }
            // editing params required before datatable fetches data
            paginateOptions = self.tableConfig.correctPaginationData(paginateOptions);
            self.$$.append("<spinner mid-spinner></spinner>");
            self.getServer().get(
                self.tableConfig.url, 
                paginateOptions, 
                self.tableConfig.pathParams
            ).done(function(resp) {
                // formatting data before passing it to grid - only use if required
                resp = self.tableConfig.dataFormatter(resp);
                // clearing previous selection
                self.rowsSelected = [];
                callback({
                    data: resp.content,
                    recordsTotal: resp.totalElements,
                    recordsFiltered: resp.totalElements,
                    draw: data.draw
                });
                // recalculating widths for the columns on redrawing
                self.gridInstance.columns.adjust();
                if(self.tableConfig.showCheckbox) {
                    self.calculateSelectionChanged();
                }
            }).always(function() {
                self.$$.find("spinner").remove();
            });
        },
        datatableRowClick: function(e, element) {
            var self = this;
            self.$$.find(".tr-selected").removeClass("tr-selected");    
            if (!jq(element).hasClass("tr-selected")) {
                jq(element).addClass("tr-selected");
                self.trigger("grid-row-clicked", self.gridInstance.row(element).data());
            }
        },
        // this method triggers checkbox based selection only
        rowSelectionChanged: function(e, element) {
            this.calculateSelectionChanged();
            this.setSelectRowsData(element);
            this.trigger("row-selection-changed", this.rowsSelected);
        },
        calculateSelectionChanged: function() {
            var self = this;
            var table = self.gridInstance.table().node();
            var chkbox_all = self.$$.find('.row-checkbox', table);
            var chkbox_checked = self.$$.find('.row-checkbox:checked', table);
            var chkbox_select_all = self.$$.find('input[type="checkbox"].select-all', table).get(0);
            // true if any row is selected
            chkbox_select_all.checked = !!(chkbox_checked.length);
            chkbox_select_all.indeterminate = (
                chkbox_checked.length && chkbox_checked.length < chkbox_all.length && 'indeterminate' in chkbox_select_all
            );
            self.tableConfig.actionsFormatter.call(self, chkbox_checked);
        },
        selectAllRows: function(e, element) {
            var self = this;
            var availableRows = self.gridElement.find(".row-checkbox:not(:disabled)");
            availableRows.prop("checked", element.checked);
            // clearing previous selection
            self.rowsSelected = [];
            availableRows.map(function(index, element) {
                self.setSelectRowsData(element);
            });
            self.trigger("row-selection-changed", self.rowsSelected);
            self.calculateSelectionChanged();
            e.stopPropagation();
        },
        // atleast one field inside the grid should be unique
        setSelectRowsData: function(element) {
            var row = jq(element).closest('tr');
            var data = this.gridInstance.row(row).data();
            var index = jq.inArray(data, this.rowsSelected);
            if (element.checked) {
                // don't add element if it already exists in the array - this scenerio might not occur in normal flow
                if(index === -1) {
                    this.rowsSelected.push(data);
                }
            } else {
                this.rowsSelected.splice(index, 1);
            }
        },
        getData: function() {
            // index: get specific row, empty: get all rows
            return this.gridInstance.rows.apply(this.getGridInstance, arguments).data();
        },
        draw: function(data) {
            var self = this;
            self.rowsSelected = [];
            self.$$.find('input[type="checkbox"].select-all').attr("checked", false);
            self.$$.find('input[type="checkbox"].select-all').prop("indeterminate", false);
            self.$$.find(".grid-actions").hide();
            if(self.gridInstance) {
                if(data) {
                    self.gridInstance.clear();
                    self.gridInstance.rows.add(data);
                    self.gridInstance.draw();
                    // recalculating widths for the columns on redrawing
                    self.gridInstance.columns.adjust();
                } else if(self.tableConfig.serverSide) {
                    self.gridInstance.draw();
                } else {
                    jq.when(self.getGridData()).done(function(resp) {
                        self.gridInstance.clear();
                        self.gridInstance.rows.add(resp);
                        self.gridInstance.draw();
                        // recalculating widths for the columns on redrawing
                        self.gridInstance.columns.adjust();
                    }).always(function() {
                        self.$$.find("spinner").remove();
                    });
                }
            }
        },
        method: function(){
            // arguments[0] is function name to be called
            return this.gridInstance[arguments[0]].apply(this, Array.prototype.slice.call(arguments, 1, arguments.length));
        },
        _remove_: function() {
            var self = this;
            jq(window).off("resize", self.resizeDatatable);
        },
        getResize: function() {
            var self = this;
            return window.debounce(function() {
                var newHeight = self.$$.parent().height() - 40 - (self.tableConfig.paginate * 50);
                self.$$.find(".dataTables_scrollBody").height(newHeight);
            }, 200, null, self.$$.parent().attr("id"));
        }
    };
});