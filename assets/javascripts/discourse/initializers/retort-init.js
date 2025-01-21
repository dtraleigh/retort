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

    // See onShow in emoj-picker for logic pattern
    @action
    onShowRetort() {
      if (!this.limited) {
        this.set("isLoading", true);
      }

      schedule("afterRender", () => {
        document.addEventListener("click", this.handleOutsideClick);

        const post = this.post;
        const emojiPicker = document.querySelector(".emoji-picker");
        const retortButton = document.querySelector(`
          article[data-post-id="${post.id}"] .post-controls .retort`);

        if (!emojiPicker || !retortButton) {
          return false;
        }

        if (!this.site.isMobileDevice) {
          this._popper = createPopper(retortButton, emojiPicker, {
            placement: this.limited ? "top" : "bottom",
          });
        }

        if (this.limited) {
          const emojis = retort_allowed_emojis.split("|");

          emojiPicker.innerHTML = `
            <div class='limited-emoji-set'>
              ${emojis
                .map(
                  (code) => `<img
                src="${emojiUrlFor(code)}"
                width=40
                height=40
                title='${code}'
                class='emoji' />`
                )
                .join("")}
            </div>
          `;

          emojiPicker.classList.add("has-limited-set");

          emojiPicker.onclick = (e) => {
            if (e.target.classList.contains("emoji")) {
              this.emojiSelected(e.target.title);
            } else {
              this.set("isActive", false);
              this.onClose();
            }
          };
        } else {
          emojiPicker
            .querySelectorAll(".emojis-container .section .section-header")
            .forEach((p) => this._sectionObserver.observe(p));

          later(() => {
            this.set("isLoading", false);
            this.applyDiscourseTrick(emojiPicker);
          }, 50);
        }
      });
    },

    // Lifted from onShow in emoji-picker. See note in that function concerning its utility.
    applyDiscourseTrick(emojiPicker) {
      schedule("afterRender", () => {
        if (!this.site.isMobileDevice || this.isEditorFocused) {
          const filter = emojiPicker.querySelector("input.filter");
          filter && filter.focus();
        }

        if (this.selectedDiversity !== 0) {
          this._applyDiversity(this.selectedDiversity);
        }
      });
    },

    @action
    onCategorySelection(sectionName) {
      const section = document.querySelector(
        `.emoji-picker-emoji-area .section[data-section="${sectionName}"]`
      );
      section &&
        section.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
    },

    @action
    onFilter(event) {
      const emojiPickerArea = document.querySelector(
        ".emoji-picker-emoji-area"
      );
      const emojisContainer =
        emojiPickerArea.querySelector(".emojis-container");
      const results = emojiPickerArea.querySelector(".results");
      results.innerHTML = "";

      if (event.target.value) {
        results.innerHTML = emojiSearch(event.target.value.toLowerCase(), {
          maxResults: 10,
          diversity: this.emojiStore.diversity,
        })
          .map(this._replaceEmoji)
          .join("");

        emojisContainer.style.visibility = "hidden";
        results.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      } else {
        emojisContainer.style.visibility = "visible";
      }
    },

    _emojisPerRow: {
      0: 1,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 3,
      7: 3,
      8: 4,
      9: 3,
      10: 5,
      11: 5,
      12: 4,
      13: 5,
      14: 7,
      15: 5,
      16: 4,
      17: 5,
      18: 6,
      19: 6,
      20: 5,
      21: 7,
      22: 5,
      23: 5,
      24: 6,
    },
  });
}

export default {
  name: "retort-button",
  initialize: function () {
    withPluginApi("0.8.6", (api) => initializePlugin(api));
  },
};
