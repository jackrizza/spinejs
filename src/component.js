
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

class Form extends Component {
    constructor(component) {
        component.tag = "form";
        super(component);
    }
}

class Label extends Component {
    constructor(component) {
        component.tag = "label";
        super(component);
    }
}

class Input extends Component {
    constructor(component) {
        component.tag = "input";
        super(component);
    }
}

class Button extends Component {
    constructor(component) {
        component.tag = "button";
        super(component);
    }
}