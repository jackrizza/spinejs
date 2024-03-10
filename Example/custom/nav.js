class NavagationCreator {
    constructor() {
        return new Nav({
            key: "navbar", classlist: ["navbar"], children: [
                new Div({
                    key: "left", classlist: ["left"], children: [
                        new H1({
                            key: "title", classlist: ["title"], children: [
                                new A({
                                    key: "title",
                                    classlist: ["titlelink"],
                                    text: "Test Site",
                                })
                            ]
                        }),
                    ]
                }),
                new Div({
                    key: "right", classlist: ["right"], children: [
                        new Ul({
                            key: "navlist", classlist: ["navlist"], children: [
                                new Li({
                                    key: "home", classlist: ["navitem"], children: [
                                        new A({
                                            key: "home",
                                            classlist: ["navlink"],
                                            text: "Home",
                                            options: { href: "#home" }
                                        })
                                    ]
                                }),
                                new Li({
                                    key: "about", classlist: ["navitem"], children: [
                                        new A({
                                            key: "about",
                                            classlist: ["navlink"],
                                            text: "About",
                                            options: { href: "#about" }
                                        })
                                    ]
                                }),
                                new Li({
                                    key: "contact", classlist: ["navitem"], children: [
                                        new A({
                                            key: "contact",
                                            classlist: ["navlink"],
                                            text: "Contact",
                                            options: { href: "#contact" }
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                })
            ]
        });
    }
}