class TableCreator extends Render {
    constructor({ key = "", table_data = {} }) { // "table": [["no"], ["data"]]
        super({})
        this.key = key;
        this.table_data = table_data.table;
    }

    table_data_does_not_exist() {
        if (!Array.isArray(this.table_data) || this.table_data.length === 0) {
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
        if (this.table_data_does_not_exist()) {
            return this.info_message("No table Header");
        }
        const firstColumnData = this.table_data[0].map(row => row);
        const tdElements = firstColumnData.map(data => new Td({ text: data ?? "" }));
        return new Tr({ children: tdElements });
    }

    table_body() {
        if (this.table_data_does_not_exist()) {
            return [this.info_message("No table data")];
        }
        const internal_table_data = this.table_data.slice(1);
        let rows = []

        for (const row of internal_table_data) {
            const tdElements = row.map(data => new Td({ text: data ?? "" }));
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
