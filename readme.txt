Javascript and WebGL demo of fast marching method and its uses

Unless I use WebGL2 I'm going to need to send the distance
field and cost field as vertex attributes. To represent them
as bilinearly interpolated (to avoid triangulation artifacts)
I'll need to send three components per vertex per field.

The fragment shader needs an offset term and two factor terms,
so it can compute z = a + b*c and sample into the contour map
with that. I would need a separate trio for representing the
bilinearly interpolated cost function.

So the question is how to represent all of this. It seems like
I won't be able to easily reuse vertices between quads because
they'll need different coefficients.

I could do triangle strips. Both the top and bottom vertices
will have the top and bottom values, plus a value of 0 or 1
to indicate which end the vertex is on. These all get
interpolated, and then in the fragment shader we linearly
interpolate the top and bottom values by the middle value.

I don't need to use an element buffer in this case; I can use
degenerate triangles to move from one strip to the next.
