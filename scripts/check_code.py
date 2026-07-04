import ast
import sys
import builtins

def check_file(filename):
    print(f"Analyzing {filename}...")
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    try:
        tree = ast.parse(content)
    except SyntaxError as e:
        print(f"Syntax Error: {e}")
        return

    # Phase 1: Collect class and method definitions
    classes = {}
    globals_set = set()
    
    # Add standard python builtins
    globals_set.update(dir(builtins))

    # Collect module-level imports and globals
    class GlobalCollector(ast.NodeVisitor):
        def visit_FunctionDef(self, node):
            pass
        def visit_ClassDef(self, node):
            pass
        def visit_Import(self, node):
            for name in node.names:
                globals_set.add(name.asname or name.name.split('.')[0])
        def visit_ImportFrom(self, node):
            for name in node.names:
                globals_set.add(name.asname or name.name.split('.')[0])
        def visit_Assign(self, node):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    globals_set.add(target.id)
                elif isinstance(target, (ast.Tuple, ast.List)):
                    for elt in target.elts:
                        if isinstance(elt, ast.Name):
                            globals_set.add(elt.id)

    collector = GlobalCollector()
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            globals_set.add(node.name)
            methods = {}
            for subnode in node.body:
                if isinstance(subnode, ast.FunctionDef):
                    # Get argument names
                    args = [arg.arg for arg in subnode.args.args]
                    methods[subnode.name] = {
                        'args': args,
                        'line': subnode.lineno,
                        'node': subnode
                    }
            classes[node.name] = {
                'methods': methods,
                'line': node.lineno,
                'node': node
            }
        elif isinstance(node, ast.FunctionDef):
            globals_set.add(node.name)
        else:
            collector.visit(node)

    # Phase 2: Walk the AST to find name errors and method call mismatches
    errors = []

    class Visitor(ast.NodeVisitor):
        def __init__(self):
            self.current_class = None
            self.current_method = None
            self.local_scopes = []  # Stack of sets for local variables

        def visit_ClassDef(self, node):
            old_class = self.current_class
            self.current_class = node.name
            self.generic_visit(node)
            self.current_class = old_class

        def visit_FunctionDef(self, node):
            old_method = self.current_method
            self.current_method = node.name
            
            # Start a new local scope
            locals_in_method = set()
            # Add parameters to local scope
            for arg in node.args.args:
                locals_in_method.add(arg.arg)
            if node.args.vararg:
                locals_in_method.add(node.args.vararg.arg)
            if node.args.kwarg:
                locals_in_method.add(node.args.kwarg.arg)
            for arg in node.args.kwonlyargs:
                locals_in_method.add(arg.arg)

            self.local_scopes.append(locals_in_method)
            self.generic_visit(node)
            self.local_scopes.pop()
            
            self.current_method = old_method

        def visit_Name(self, node):
            # Check for read of undefined name (not checking writes)
            if isinstance(node.ctx, ast.Load):
                name = node.id
                # Check if it's in any local scope (starting from inner-most)
                found = False
                for scope in reversed(self.local_scopes):
                    if name in scope:
                        found = True
                        break
                if not found and name not in globals_set:
                    # Ignore some common PyQt/environment variables if they aren't parsed
                    if name not in ['self', '__file__', '__name__', 'QtCore', 'QtGui', 'QtWidgets', 'Qt']:
                        errors.append((node.lineno, f"Undefined name '{name}' in method '{self.current_method}' of class '{self.current_class}'"))
            elif isinstance(node.ctx, ast.Store):
                # Add to local scope if we are inside a method
                if self.local_scopes:
                    self.local_scopes[-1].add(node.id)

        def visit_Assign(self, node):
            # For target names, we need to register them as store context first
            # But ast.NodeVisitor will visit them anyway. Let's make sure we visit targets, then value
            self.generic_visit(node)

        def visit_Call(self, node):
            # Check method calls on self.xxx(...)
            if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'self':
                method_name = node.func.attr
                if self.current_class and self.current_class in classes:
                    class_info = classes[self.current_class]
                    if method_name not in class_info['methods']:
                        # Could be inherited or dynamically set, but good to check
                        # In this PyQt5 app, let's see if it's defined anywhere in the class
                        # Let's list it as a potential warning
                        errors.append((node.lineno, f"Warning: 'self.{method_name}' called in '{self.current_class}' but not defined in this class."))
            
            # Check connection references like button.clicked.connect(self.method_name)
            if isinstance(node.func, ast.Attribute) and node.func.attr == 'connect':
                if len(node.args) == 1:
                    arg = node.args[0]
                    if isinstance(arg, ast.Attribute) and isinstance(arg.value, ast.Name) and arg.value.id == 'self':
                        target_method = arg.attr
                        if self.current_class and self.current_class in classes:
                            class_info = classes[self.current_class]
                            if target_method not in class_info['methods']:
                                errors.append((node.lineno, f"Error: Connecting to non-existent method 'self.{target_method}' in class '{self.current_class}'"))

            self.generic_visit(node)

    visitor = Visitor()
    visitor.visit(tree)

    print("\n--- Potential Issues & Bugs Found ---")
    errors.sort()
    for line, msg in errors:
        print(f"Line {line}: {msg}")

if __name__ == '__main__':
    check_file("AI_Dubber_PyQt5_Complete.py")
