class Render {
    constructor({ key = "", tag = "", classlist = [], options = {}, text = "", children = [], onload = () => { } }) {
        this.key = key;
        this.tag = tag;
        this.classlist = classlist;
        this.options = options;
        this.text = text;
        this.children = children;
        this.onload = onload;
    }
    render() {
        console.log(this)
        const new_object = document.createElement(this.tag);
        new_object.id = this.key;
        new_object.classList = this.classlist.join(" ");
        new_object.innerHTML = this.text;

        if (this.options != undefined) {
            for (let option in this.options) {
                // console.log(this.options[option])
                let key = Object.keys(this.options[option]);
                new_object.setAttribute(key, this.options[option][key])
            }

        }


        try {
            if (this.children.length > 0) {
                for (let child of this.children) {
                    // console.log("Render Children Try / Catch - Key : " + child.key + " Type : " + typeof child)
                    // console.log(child)
                    if (child.isNotAComponent) {
                        child.render().then(c => {
                            new_object.appendChild(c.render());
                        })
                    } else {
                        new_object.appendChild(child.render());
                    }
                }
            }
        }

        catch (error) {
            new_object
                .appendChild(new Div({
                    key: "error",
                    classlist: ["error", "message"],
                    text: "Error",
                    children: [
                        new Ul({
                            classlist: [],
                            children: [
                                new Li({
                                    classlist: [],
                                    text: error
                                })
                            ]
                        })

                    ]
                }).render())

        }


        // Rest of your code here
        return new_object;

    }
}


class Component extends Render {
    constructor(render) {
        super(render)
    }


}

class H1 extends Component {
    constructor(component) {
        component.tag = "h1";
        super(component)
    }
}

class H2 extends Component {
    constructor(component) {
        component.tag = "h2";
        super(component)
    }
}

class H3 extends Component {
    constructor(component) {
        component.tag = "h3";
        super(component)
    }
}

class H4 extends Component {
    constructor(component) {
        component.tag = "h4";
        super(component)
    }
}

class P extends Component {
    constructor(component) {
        component.tag = "p";
        super(component)
    }
}

class A extends Component {
    constructor(component) {
        component.tag = "a";
        super(component);
    }
}

class Ul extends Component {
    constructor(component) {
        component.tag = "ul";
        super(component);
    }
}

class Li extends Component {
    constructor(component) {
        component.tag = "li";
        super(component);
    }
}

class Div extends Component {
    constructor(component) {
        component.tag = "div";
        super(component);
    }
}

class Table extends Component {
    constructor(component) {
        component.tag = "table";
        super(component);
    }
}

class Tr extends Component {
    constructor(component) {
        component.tag = "tr";
        super(component);
    }
}

class TableData extends Component {
    constructor(component) {
        component.tag = "td";
        super(component);
    }
}

class Thead extends Component {
    constructor(component) {
        component.tag = "thead";
        super(component);
    }
}

class Th extends Component {
    constructor(component) {
        component.tag = "th";
        super(component);
    }
}

class Td extends Component {
    constructor(component) {
        component.tag = "td";
        super(component);
    }
}

class Nav extends Component {
    constructor(component) {
        component.tag = "nav";
        super(component);
    }
}

class Tbody extends Component {
    constructor(component) {
        component.tag = "tbody";
        super(component);
    }
}
