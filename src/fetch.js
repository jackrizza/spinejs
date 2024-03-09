function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}



class SingleFetch {
    constructor(url, after = {}) {
        this.isNotAComponent = true;
        return this.fetcher(url)
            .catch(error => {
                return {
                    "Error": error,
                }
            });

    }
    isOnline() {
        return window.navigator.onLine;
    }
    noAfterFallback() {
        "You need a after function."
    }
    async fetcher(url) {
        return new Promise((resolve, reject) => {
            if (this.isOnline()) {
                fetch(url)
                    .then(response => response.json())
                    .then(response => {
                        // console.log(response)
                        if (Object.keys(response).length > 0) {
                            localStorage.setItem(url, JSON.stringify(response));
                            resolve(JSON.parse(localStorage.getItem(url)))
                        }

                    })
            } else {
                resolve(JSON.parse(localStorage.getItem(url)));
            }
            // reject("No Idea")
        });
    }
}

class Fetch {
    constructor({ url = "", runtime = "", callback = {} }) {
        this.key = makeid(16);
        this.url = url = url;
        this.runtime = runtime;
        this.callback = callback;
        this.isNotAComponent = true;

    }
    execute() {
        new SingleFetch(this.url).then(url => {
            // console.log("In the background process : " + this.key)
            let internal_callback = new this.callback({
                key: this.key, table_data: url,
            });

            let node = internal_callback.table();

            document.getElementById(this.key).innerHTML = "";
            document.getElementById(this.key).classList = "";
            document.getElementById(this.key).appendChild(node.render());

        })
    }
    // this is named render() and not fetch to allow this class
    // to be called in the SpineTree
    async render() {
        console.log(this)
        if ("requestIdleCallback" in window) {
            // passing object with timeout property
            // as the second argument
            // to make sure your process gets called after 4 seconds
            requestIdleCallback(() => {
                if (this.runtime == "") {
                    console.log("One Time")
                    this.execute()
                }
                if (this.runtime == "slow") {

                    console.log("Looping slow")
                    this.execute()
                    let id = window.setInterval(() => {
                        console.log("Looping execute()");
                        this.execute()
                    }, 1500);
                    console.log("Interval id : " + id)

                    var stored = JSON.parse(state.get("interval-id"));
                    stored.push(id)
                    state.set("interval-id", JSON.stringify(stored))
                }

            });
        } else {



        }


        return new this.callback({ key: this.key }).placeholder()
    }
}