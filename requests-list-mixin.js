/**
@license
Copyright 2018 The Advanced REST client authors <arc@mulesoft.com>
Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License. You may obtain a copy of
the License at
http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations under
the License.
*/
import {dedupingMixin} from '../../@polymer/polymer/lib/utils/mixin.js';
/**
 * A mixin to be used with elements that consumes lists of requests.
 * It implements event listeners related to requests data change.
 *
 * @polymer
 * @mixinFunction
 * @memberof ArcComponents
 */
export const RequestsListMixin = dedupingMixin((base) => {
  /**
   * @polymer
   * @mixinClass
   */
  class RLmixin extends base {
    static get properties() {
      return {
        /**
         * The list of request to render.
         * It can be eirther saved, history or project items.
         * @type {Array<Object>}
         */
        requests: Array,
        /**
         * Computed value, true when the project has requests.
         */
        hasRequests: {
          type: Boolean,
          value: false,
          computed: '_computeHasRequests(requests.length)',
          notify: true
        },
        /**
         * Requests list type. Can be one of:
         * - saved
         * - history
         * - project
         *
         * Depending on the the type request change event is handled differently.
         * For saved and history requests corresponding type is processed.
         * For project requests list only request that has project id in the
         * projects list is processed.
         *
         * This property must be set.
         */
        type: String,
        /**
         * Project datastore ID to display.
         * This should be set only when type is `project`
         */
        projectId: String,
        /**
         * Changes information density of list items.
         * By default it uses material's peper item with two lines (72px heigth)
         * Possible values are:
         *
         * - `default` or empty - regular list view
         * - `comfortable` - enables MD single line list item vie (52px heigth)
         * - `compact` - enables list that has 40px heigth (touch recommended)
         */
        listType: {
          type: String,
          reflectToAttribute: true,
          observer: '_updateListStyles'
        },
        /**
         * Computed value if the list item should be consisted of two lines of
         * description.
         */
        _hasTwoLines: {value: true, type: Boolean, computed: '_computeHasTwoLines(listType)'},
        /**
         * A project object associated with requests.
         * This is only valid when `type` is set to `project`. It is set automatically
         * when `readProjectRequests()` is called.
         */
        project: Object
      };
    }

    constructor() {
      super();
      this._requestDeletedHandler = this._requestDeletedHandler.bind(this);
      this._requestChangedHandler = this._requestChangedHandler.bind(this);
      this._projectChanged = this._projectChanged.bind(this);
    }

    connectedCallback() {
      super.connectedCallback();
      window.addEventListener('request-object-deleted', this._requestDeletedHandler);
      window.addEventListener('request-object-changed', this._requestChangedHandler);
      window.addEventListener('project-object-changed', this._projectChanged);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('request-object-deleted', this._requestDeletedHandler);
      window.removeEventListener('request-object-changed', this._requestChangedHandler);
      window.removeEventListener('project-object-changed', this._projectChanged);
    }
    /**
     * Dispatches bubbling and composed custom event.
     * By default the event is cancelable until `cancelable` property is set to false.
     * @param {String} type Event type
     * @param {?any} detail A detail to set
     * @param {?Boolean} cancelable True if the event is cancelable (default value).
     * @return {CustomEvent}
     */
    _dispatch(type, detail, cancelable) {
      if (typeof cancelable !== 'boolean') {
        cancelable = true;
      }
      const e = new CustomEvent(type, {
        bubbles: true,
        composed: true,
        cancelable,
        detail
      });
      this.dispatchEvent(e);
      return e;
    }
    /**
     * Handler for `request-object-deleted` event. Removes request from the list
     * if it existed.
     * @param {CustomEvent} e
     */
    _requestDeletedHandler(e) {
      const requests = this.requests;
      if (e.cancelable || !requests || !requests.length) {
        return;
      }
      const deleteId = e.detail.id;
      switch (this.type) {
        case 'history':
          this._historyItemDeleted(deleteId);
          break;
        default:
          this._itemDeleted(deleteId);
          break;
      }
    }
    /**
     * Removes an item from the list by given id.
     * @param {String} id Request ID to remove
     */
    _itemDeleted(id) {
      const requests = this.requests;
      for (let i = 0, len = requests.length; i < len; i++) {
        if (requests[i]._id === id) {
          this.splice('requests', i, 1);
          return;
        }
      }
    }
    /**
     * Removes a history item from the list by given id.
     * @param {String} id Request ID to remove
     */
    _historyItemDeleted(id) {
      const requests = this.requests;
      for (let i = 0, len = requests.length; i < len; i++) {
        if (requests[i]._id === id) {
          const old = this.requests[i];
          const nextIndex = i + 1;
          const next = this.requests[nextIndex];
          if (old.hasHeader && next && !next.hasHeader) {
            this.set(['requests', nextIndex, 'header'], old.header);
            this.set(['requests', nextIndex, 'hasHeader'], old.hasHeader);
          }
          this.splice('requests', i, 1);
          return;
        }
      }
    }
    /**
     * Handler for `request-object-changed` custom event.
     * Depending on the `type` property it updates / adds / removes item from
     * the requests list.
     * @param {CustomEvent} e
     */
    _requestChangedHandler(e) {
      if (e.cancelable) {
        return;
      }
      const request = e.detail.request;
      switch (this.type) {
        case 'history':
          if (this._historyTypeChanged) {
            this._historyTypeChanged(request);
          }
          break;
        case 'saved':
          this._savedTypeChanged(request);
          break;
        case 'project':
          this._projectTypeChanged(request);
          break;
      }
    }
    /**
     * Handles request change when type is project.
     * @param {Object} request Changed request object.
     */
    _projectTypeChanged(request) {
      const projectId = this.projectId;
      if (!projectId) {
        return;
      }
      const requests = this.requests;
      if (!requests) {
        if (this._isProjectRequest(request)) {
          this.requests = [request];
        }
        return;
      }
      for (let i = requests.length - 1; i >= 0; i--) {
        if (requests[i]._id === request._id) {
          if (this._isProjectRequest(request)) {
            this.set(`requests.${i}`, request);
          } else {
            this.splice('requests', i, 1);
          }
          return;
        }
      }
      if (this._isProjectRequest(request)) {
        if (this.project) {
          const index = this.project.requests.indexOf(request._id);
          this.splice('requests', index, 0, request);
        } else {
          this.push('requests', request);
        }
      }
    }
    /**
     * Checks if requests is related to current project.
     * `projectId` has to be set on the element.
     * @param {Object} request
     * @return {Boolean}
     */
    _isProjectRequest(request) {
      const projectId = this.projectId;
      if (!projectId) {
        return false;
      }
      if (request.projects && request.projects.indexOf(projectId) !== -1) {
        return true;
      } else if (request.legacyProject === projectId) {
        return true;
      }
      return false;
    }
    /**
     * Handles request change when type is saved or history.
     * @param {Object} request Changed request object.
     */
    _savedTypeChanged(request) {
      const t = this.type;
      if (t !== 'saved') {
        return;
      }
      if (['saved', 'saved-requests'].indexOf(request.type) === -1) {
        return;
      }
      const requests = this.requests;
      if (!requests) {
        this.set('requests', [request]);
        return;
      }
      for (let i = 0, len = requests.length; i < len; i++) {
        if (requests[i]._id === request._id) {
          this.set(`requests.${i}`, request);
          return;
        }
      }
      this.unshift('requests', request);
    }
    /**
     * Dispatches `project-read` custom event and returns it.
     * @param {String} id Project ID to read
     * @return {CustomEvent} Disaptched custom event
     */
    _dispatchProjectRead(id) {
      return this._dispatch('project-read', {
        id
      });
    }
    /**
     * Dispatches `request-project-list` custom event and returns it.
     * @param {String} id Project ID
     * @return {CustomEvent} Disaptched custom event
     */
    _dispatchProjectList(id) {
      return this._dispatch('request-project-list', {
        id
      });
    }

    /**
     * Dispatches `request-object-changed` custom event and returns it.
     * @param {String} type Request type, `saved` or `history`.
     * @param {Object} request Updated request to store.
     * @return {CustomEvent} Disaptched custom event
     */
    _dispatchRequestChanged(type, request) {
      return this._dispatch('request-object-changed', {
        type,
        request
      });
    }
    /**
     * A function to read request data for a project.
     * @param {String} projectId Project ID
     * @return {Promise} Promise.resolved to requests list.
     */
    readProjectRequests(projectId) {
      let p;
      const currentProject = this.project;
      const hasCurrentProject = !!currentProject;
      if (hasCurrentProject && currentProject._id === projectId) {
        p = Promise.resolve(currentProject);
      } else {
        const e = this._dispatchProjectRead(projectId);
        if (!e.defaultPrevented) {
          p = Promise.reject(new Error(`project-read event not handled`));
        } else {
          p = e.detail.result;
        }
      }

      let projectHasRequests;
      return p.then((project) => {
        if (!hasCurrentProject) {
          this.project = project;
        }
        projectHasRequests = !!project.requests;
        const e = this._dispatchProjectList(project._id);
        if (!e.defaultPrevented) {
          return Promise.reject(new Error('request-project-list event not handled'));
        }
        return e.detail.result;
      })
      .then((requests) => {
        if (!projectHasRequests) {
          requests.sort(this._legacySort);
        }
        return requests;
      });
    }

    /**
     * Sorts requests list by `projectOrder` property
     *
     * @param {Object} a
     * @param {Object} b
     * @return {Number}
     */
    _legacySort(a, b) {
      if (a.projectOrder > b.projectOrder) {
        return 1;
      }
      if (a.projectOrder < b.projectOrder) {
        return -1;
      }
      if (a.name > b.name) {
        return 1;
      }
      if (a.name < b.name) {
        return -1;
      }
      return 0;
    }

    /**
     * Updates requests in bulk opeartion.
     * @param {[type]} items [description]
     * @return {[type]} [description]
     */
    _updateBulk(items) {
      const promises = items.map((item) => this._updateRequest(item));
      return Promise.all(promises);
    }
    /**
     * Sends the `request-object-changed` custom event for each request on the list.
     * @param {Object} request Request object.
     * @return {Promise} Promise resolved when the request object is updated.
     */
    _updateRequest(request) {
      this._validateType(this.type);
      let type;
      switch (this.type) {
        case 'saved':
        case 'project':
          type = 'saved';
          break;
        case 'history':
          type = 'history';
          break;
      }
      const e = this._dispatchRequestChanged(type, request);
      if (!e.defaultPrevented) {
        return Promise.reject(new Error('Request model not found'));
      }
      return e.detail.result;
    }

    _computeHasRequests(length) {
      return !!length;
    }
    /**
     * Computes value for `_hasTwoLines` property.
     * @param {?String} listType Selected list type.
     * @return {Boolean}
     */
    _computeHasTwoLines(listType) {
      if (!listType || listType === 'default') {
        return true;
      }
      return false;
    }
    /**
     * Updates icon size CSS variable and notifies resize on the list when
     * list type changes.
     * @param {?String} type
     */
    _updateListStyles(type) {
      let size;
      switch (type) {
        case 'comfortable': size = 48; break;
        case 'compact': size = 36; break;
        default: size = 72; break;
      }
      this._applyListStyles(size);
    }
    /**
     * Applies `--paper-item-icon-width` variable.
     * @param {Number} size Icon width in pixels.
     * @param {?Element} target The target to apply styling. Default to this.
     */
    _applyListStyles(size, target) {
      target = target || this;
      const value = `${size}px`;
      if (!window.ShadyCSS) {
        target.style.setProperty('--paper-item-icon-width', value);
      } else {
        target.updateStyles({
          '--paper-item-icon-width': value
        });
      }
      if (target.notifyResize) {
        target.notifyResize();
      }
    }
    /**
     * Stores current order of requests in the project.
     * This shouls be only called wshen `project` property is set.
     * @return {Promise}
     */
    _persistRequestsOrder() {
      if (!this.project) {
        return Promise.reject(new Error('"project" is not set'));
      }
      const items = this.requests;
      const newOrder = items.map((item) => item._id);
      const project = Object.assign({}, this.project);
      if (this._idsArrayEqual(project.requests, newOrder)) {
        return Promise.resolve();
      }
      this.set('project.requests', newOrder);
      delete project.opened;
      return this._dispatchProjectUpdate(project);
    }
    /**
     * Tests if two arrays has the same order of ids (strings).
     * @param {Array<String>} a1 Array a
     * @param {Array<String>} a2 Array b
     * @return {Boolean} True when elements are ordered the same way.
     */
    _idsArrayEqual(a1, a2) {
      if (!a1 && !a2) {
        return true;
      }
      if (!a1 || !a2) {
        return false;
      }
      if (a1.length !== a2.length) {
        return false;
      }
      for (let i = 0, len = a1.length; i < len; i++) {
        if (a1[i] !== a2[i]) {
          return false;
        }
      }
      return true;
    }
    /**
     * Dispatches `project-object-changed` event to inform model to update
     * the data.
     *
     * @param {Object} project Data to store.
     * @return {Promise}
     */
    _dispatchProjectUpdate(project) {
      const e = this._dispatch('project-object-changed', {
        project
      });
      if (!e.defaultPrevented) {
        return Promise.reject(new Error('Projects model not found'));
      }
      return e.detail.result;
    }

    /**
     * Handler for the `project-object-changed` event.
     * @param {CustomEvent} e
     * @return {Boolean} False if the event was not handled.
     */
    _projectChanged(e) {
      if (e.cancelable || this.type !== 'project' || !this.project ||
        e.composedPath()[0] === this) {
        return false;
      }
      const {project} = e.detail;
      if (this.project._id !== project._id) {
        return false;
      }
      this.project = project;
      this._updateProjectOrder(project);
      return true;
    }
    /**
     * Updates requests order when project changed.
     * It reorder requests array for changed project order. It won't change
     * requests array when order is the same. It also won't change order when
     * request list is different that project's requests list.
     * @param {Object} project Changed project
     * @return {Boolean} True when order has changed
     */
    _updateProjectOrder(project) {
      const requests = this.requests;
      if (!requests || !project.requests) {
        return false;
      }
      if (requests.length !== project.requests.length) {
        // request is being added or removed
        return false;
      }
      const newOrder = [];
      let changed = false;
      for (let i = 0, len = project.requests.length; i < len; i++) {
        const id = project.requests[i];
        const rPos = requests.findIndex((item) => item._id === id);
        if (rPos === -1) {
          // unknown state, better quit now
          return false;
        }
        newOrder[i] = requests[rPos];
        if (i !== rPos) {
          changed = true;
        }
      }
      if (changed) {
        this.set('requests', newOrder);
      }
      return changed;
    }
    /**
     * Dispatches `export-data` event and returns it.
     * @param {Array<Object>} requests List of request to export.
     * @param {Object} opts
     * @return {CustomEvent}
     */
    _dispatchExportData(requests, opts) {
      this._validateType(this.type);
      const data = {};
      switch (this.type) {
        case 'history': data.history = requests; break;
        case 'project':
          data.saved = requests;
          data.projects = [this.project];
          break;
        case 'saved': data.saved = requests; break;
      }
      return this._dispatch('arc-data-export', {
        options: opts.options,
        providerOptions: opts.providerOptions,
        data
      });
    }
    /**
     * Dispatches navigate event to open a request
     * @param {[type]} id [description]
     * @return {[type]} [description]
     */
    _openRequest(id) {
      let type = this.type;
      this._validateType(type);
      if (type === 'project') {
        type = 'saved';
      }
      return this._dispatch('navigate', {
        base: 'request',
        type,
        id
      });
    }
    /**
     * Throws an error when type is not set.
     * @param {String} type Passed to the function type
     */
    _validateType(type) {
      if (['project', 'history', 'saved'].indexOf(type) === -1) {
        throw new TypeError('The "type" property is not set.');
      }
    }
  }
  return RLmixin;
});