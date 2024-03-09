class TableCreator extends Render {
    constructor({ key = key, table_data = {} }) { // "table": [["no"], ["data"]] 
        super({})
        console.log("table data key : " + Object.keys(table_data).length)
        // console.log("Table Creation")
        this.key = key;
        console.log(table_data)
        this.table_data = table_data.table;
    }

    table_data_does_not_exist() {
        if (this.table_data === undefined || Object.keys(this.table_data).index == 0) {
            return true
        } else {
            return false
        }
    }

    info_message(msg) {

        return new Div({
            key: this.key,
            classlist: ["info", "message"],
            children: [
                new Ul({
                    children: [
                        new Li({ text: msg })
                    ]
                })
            ]
        });

    }

    table_header() {
        console.log("There is no table data : " + this.table_data_does_not_exist());
        console.log(this)
        if (this.table_data_does_not_exist()) {
            return this.info_message("No table Header");
        }
        const firstColumnData = this.table_data[0].map(row => row);
        const tdElements = firstColumnData.map(data => new Td({ text: data || "" }));
        console.log(tdElements)
        return new Tr({ children: tdElements });
    }

    table_body() {
        if (this.table_data_does_not_exist()) {
            return this.info_message("No table data");
        }
        let interal_table_data = this.table_data;
        interal_table_data.shift();
        let rows = []

        for (let index in interal_table_data) {
            const firstColumnData = this.table_data[index].map(row => row);
            const tdElements = firstColumnData.map(data => new Td({ text: data || "" }));
            // console.log(tdElements)

            rows.push(new Tr({ children: tdElements }));
        }

        return rows

    }


    table() {
        return new Table({
            classlist: ["table"], children: [
                new Thead({ classlist: ["thead"], children: [this.table_header()] }),
                new Tbody({ key: "tbody", classlist: ["tbody"], children: this.table_body() })
            ]
        });
    }

    placeholder() {
        return new Div({
            key: this.key,
            classlist: ["info", "message"],
            text: "Table is still loading"
        });

    }

}