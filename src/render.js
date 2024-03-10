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
        const new_object = document.createElement(this.tag);
        new_object.id = this.key;
        new_object.classList = this.classlist.join(" ");
        new_object.innerHTML = this.text;

        if (this.options != undefined) {
            console.log(this.options)
            for (let key in this.options) {
                new_object.setAttribute(key, this.options[key])
            }

        }

        console.log(new_object)

        try {
            if (this.children.length > 0) {
                for (let child of this.children) {
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
            console.error(error);
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

