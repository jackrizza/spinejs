class Spine {
    constructor(routes) {
        this.active_route = "";
        this.routes = routes;
    }


    setActiveRoute(route) {
        this.active_route = route;
    }


    renderRoute() {
        while (document === "undefined") {

        }
        if (this.active_route.length == 0) {
            if (state.get("current_url_hash") != []) {
                this.active_route = state.get("current_url_hash")
            } else {
                this.active_route = "home";
            }
        }
        document.getElementById("app").innerHTML = "";
        try {
            console.log(this.routes[0].key, this.active_route)
            let route = this.routes.find(route => route.key === this.active_route)

            document.getElementById("app").appendChild(route.tree.render());
        } catch (error) {
            document.getElementById("app").appendChild(new Div({
                key: "error",
                classlist: ["error message"],
                children: [
                    new Ul({
                        children: [
                            new Li({ text: error }),

                            new Li({ text: error.message })
                        ]
                    })
                ]
            }).render());
        }
    }


}