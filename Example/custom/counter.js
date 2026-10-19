class CounterExample extends Div {
    constructor(store) {
        super({
            key: "counter_card",
            classlist: ["card"],
            children: [
                new H1({ text: "Reactive counter" }),
                new P({
                    key: "counter_value", store, watch: ["count"],
                    text: store => `Count: ${store.get("count", 0)}`
                }),
                new Div({
                    store, watch: ["count"],
                    text: store => `Second view: ${store.get("count", 0)}. `,
                    children: [
                        new Label({
                            text: "Type here, then change count: ",
                            options: { for: "counter_input" }
                        }),
                        new Input({
                            key: "counter_input",
                            options: { type: "text", placeholder: "Your text stays here" }
                        })
                    ]
                }),
                new Button({
                    text: "Increase", options: { type: "button" },
                    on: { click: () => store.set("count", store.get("count", 0) + 1) }
                }),
                new Button({
                    text: "Reset", options: { type: "button" },
                    on: { click: () => store.set("count", 0) }
                }),
                new P({ text: "Both views share count. Navigate away and back to mount fresh bindings." })
            ]
        });
    }
}
