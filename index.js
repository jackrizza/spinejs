class BaseSpine {
    constructor() {

        return new Promise((resolve, reject) => {
            return resolve(new Spine([{
                key: 'home',
                tree: new Tree("home", new Div({
                    key: "Home", classlist: ["container"], children: [
                        new NavagationCreator(),
                        new Div({
                            key: "home_card", classlist: ["card"], children: [
                                new H1({ key: "h1", classlist: ["h1"], text: "Hello World" }),
                                new P({ key: "paragraph", classlist: ["paragraph"], text: "Hello World" }),
                            ]
                        })
                    ]
                }), onload = () => {
                    console.log("Home Page Loaded");
                }),
            },
            {
                key: 'about',
                tree: new Tree("about", new Div({
                    key: "About", classlist: ["container"], children: [
                        new NavagationCreator(),
                        new Div({
                            key: "About", classlist: ["card"], children: [
                                new H1({
                                    key: "about_h1",
                                    classlist: ["h1"],
                                    text: "About Page"
                                }),
                                new Fetch({
                                    url: "/src/example_table.json",
                                    runtime: "slow",
                                    callback: TableCreator
                                })
                            ]
                        })
                    ]
                }), onload = () => {
                    console.log("About Page Loaded");
                })
            },
            {
                key: 'contact',
                tree: new Tree("contact", new Div({
                    key: "Contact", classlist: ["container"], children: [
                        new NavagationCreator(),
                        new Div({
                            key: "About", classlist: ["card"], children: [
                                new H1({ classlist: ["h1"], text: "Contact Page" }),
                                new Form({
                                    key: makeid(16),
                                    classlist: ["form"],
                                    options: {
                                        action: "/form_submit",
                                    },
                                    children: [
                                        new Input({
                                            classlist: ["input"],
                                            options: {
                                                type: "text",
                                                placeholder: "Name"
                                            }
                                        }),
                                        new Input({
                                            classlist: ["input"],
                                            options: {
                                                type: "text",
                                                placeholder: "Email"
                                            }
                                        }),
                                        new Input({
                                            classlist: ["input"],
                                            options: {
                                                type: "text",
                                                placeholder: "Phone"
                                            }
                                        }),
                                        new Input({
                                            classlist: ["input"],
                                            options: {
                                                type: "text",
                                                placeholder: "Message"
                                            }
                                        }),
                                        new Input({
                                            classlist: ["input"],
                                            options: {
                                                type: "submit",
                                                value: "submit form"
                                            }
                                        }),
                                    ]
                                })
                            ]
                        })
                    ]
                }), onload = () => {
                    console.log("About Page Loaded");
                })
            }]))
        })
    }

}