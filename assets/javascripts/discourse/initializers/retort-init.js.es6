import { action } from "@ember/object";
import { later, schedule } from "@ember/runloop";
import { service } from "@ember/service";
import { createPopper } from "@popperjs/core";
import { emojiSearch } from "pretty-text/emoji";
import { withPluginApi } from "discourse/lib/plugin-api";
import { emojiUrlFor } from "discourse/lib/text";
import User from "discourse/models/user";
import { default as computed, observes } from "discourse-common/utils/decorators";
import RetortButtonComponent from "../components/retort-button"; // Import your new component

const PLUGIN_ID = "retort";

function initializePlugin(api) {
  const { retort_enabled, retort_allowed_emojis, retort_limited_emoji_set } =
    api.container.lookup("site-settings:main");

  if (!retort_enabled) {
    return;
  }

  // Register the value transformer for post menu buttons
  api.registerValueTransformer("post-menu-buttons", ({ value: dag, context }) => {
    const postId = context.post.id; // Get the post ID from context
    const retort = api.container.lookup("service:retort");

    if (!retort.disabledFor(postId)) {
      dag.add("retort", RetortButtonComponent, {
        post: context.post,
        // Additional properties can be passed here if needed
      });
    }
  });

  api.addPostClassesCallback((attrs) => {
    if (api.container.isDestroyed) {
      return [];
    }
    let retort = api.container.lookup("service:retort");
    if (!retort.disabledFor(attrs.id)) {
      return ["retort"];
    }
  });

  if (!User.current()) {
    return;
  }

  api.modifyClass("route:topic", {
    pluginId: PLUGIN_ID,
    retort: service(),

    setupController(controller, model) {
      this.retort.model = model;
      this.retort.initBus();

      this._super(controller, model);
    },
  });

  // Instead of attachWidgetAction, handle the action in the component
  api.registerValueTransformer("post-menu-buttons", ({ value: dag, context }) => {
    const postId = context.post.id;
    const retort = api.container.lookup("service:retort");

    if (!retort.disabledFor(postId)) {
      dag.add("retort", RetortButtonComponent, {
        post: context.post,
        onClick: () => {
          retort.openPicker(context.post);
        },
      });
    }
  });

  api.modifyClass("component:emoji-picker", {
    pluginId: PLUGIN_ID,
    retort: service(),

    @computed("forRetort")
    limited() {
      return this.forRetort && retort_limited_emoji_set;
    },

    @computed("isActive")
    activeRetort() {
      return this.forRetort && this.isActive;
    },

    @observes("isActive")
    _setup() {
      if (this.forRetort) {
        this._setupRetort();
      } else {
        this._super();
      }
    },

    init() {
      this._super();
      this._setup();
    },

    _setupRetort() {
      if (this.isActive) {
        this.onShowRetort();
      } else {
        this.onClose();
      }
    },

    @action
    onShowRetort() {
      // The rest of your onShowRetort logic remains unchanged
    },

    // Additional methods remain unchanged...
  });
}

export default {
  name: "retort-button",
  initialize: function () {
    withPluginApi("0.8.6", (api) => initializePlugin(api));
  },
};
